# 🚌 School Bus Tracker Backend - Enhancement Roadmap

> Backend-specific enhancements, API improvements, and infrastructure optimizations.

---

## 📊 Current Status

### ✅ Completed Features
- [x] Express.js API server
- [x] Socket.IO for real-time updates
- [x] Prisma ORM with PostgreSQL schema
- [x] Traccar integration for GPS data
- [x] Auth routes (login, register, me)
- [x] Bus, Route, Stop, Student CRUD routes
- [x] ETA calculation service
- [x] Bus simulator for testing

---

## 🎯 Priority Enhancements

### 1. ETA Service Improvements (High Priority)

#### Current Issues:
```
Current: distance / speed = time (basic Haversine)
```

#### Enhanced Algorithm:
```javascript
calculateETA(busPosition, targetStop, route) {
  // 1. Calculate remaining distance along route
  const remainingDistance = calculateRouteDistance(busPosition, targetStop, route);
  
  // 2. Count remaining stops
  const remainingStops = getStopsBeforeTarget(busPosition, targetStop, route);
  const stopTime = remainingStops * 30; // 30 seconds per stop
  
  // 3. Get current speed (fallback to average)
  const speed = busPosition.speed > 5 ? busPosition.speed : route.averageSpeed;
  
  // 4. Apply traffic multiplier
  const trafficMultiplier = getTrafficMultiplier(new Date().getHours());
  
  // 5. Calculate final ETA
  const travelTime = (remainingDistance / speed) * trafficMultiplier;
  return travelTime + stopTime;
}
```

#### Traffic Multiplier Table:
| Time | Multiplier | Reason |
|------|------------|--------|
| 7:00-9:00 | 1.4 | Morning rush |
| 9:00-16:00 | 1.0 | Normal |
| 16:00-18:00 | 1.3 | Evening rush |
| 18:00-7:00 | 0.9 | Light traffic |

#### API Endpoints to Add:
```
GET  /api/tracking/eta/:busId/:stopId     # ETA to specific stop
GET  /api/tracking/eta/:busId/all-stops   # ETA to all upcoming stops
POST /api/tracking/report-delay           # Manual delay report
```

---

### 2. Stop Progress Tracking (High Priority)

**Goal:** Track which stops the bus has already passed and emit real-time updates

#### How It Works:
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Bus Position│────▶│ Stop Progress    │────▶│ WebSocket Emit  │
│   Update    │     │ Service          │     │ to Parents      │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Detection   │
                    │ Methods:    │
                    │ - Geofence  │
                    │ - Distance  │
                    │ - Order     │
                    └─────────────┘
```

#### Database Schema Addition:
```prisma
// prisma/schema.prisma
model StopVisit {
  id        Int      @id @default(autoincrement())
  busId     Int
  stopId    Int
  routeId   Int
  visitedAt DateTime @default(now())
  tripDate  DateTime @db.Date  // Which day's trip
  
  bus   Bus   @relation(fields: [busId], references: [id])
  stop  Stop  @relation(fields: [stopId], references: [id])
  route Route @relation(fields: [routeId], references: [id])
  
  @@unique([busId, stopId, tripDate])  // One visit per stop per day
  @@index([busId, tripDate])
}
```

#### Stop Progress Service:
```typescript
// src/services/stop-progress.service.ts
interface StopStatus {
  stopId: number;
  status: 'passed' | 'current' | 'upcoming';
  passedAt?: Date;
  etaMinutes?: number;
}

class StopProgressService {
  private readonly GEOFENCE_RADIUS = 100; // meters
  
  /**
   * Check if bus has entered/exited any stop geofences
   * Called on each position update
   */
  async processPositionUpdate(busId: number, position: Position): Promise<void> {
    const route = await this.getActiveRoute(busId);
    if (!route) return;
    
    const stops = await this.getRouteStops(route.id);
    
    for (const stop of stops) {
      const distance = this.calculateDistance(
        position.latitude, position.longitude,
        stop.latitude, stop.longitude
      );
      
      // Bus entered stop geofence
      if (distance <= this.GEOFENCE_RADIUS) {
        await this.markStopVisited(busId, stop.id, route.id);
      }
    }
    
    // Emit updated progress to all listeners
    await this.emitStopProgress(busId, route.id);
  }
  
  /**
   * Mark a stop as visited
   */
  async markStopVisited(busId: number, stopId: number, routeId: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await prisma.stopVisit.upsert({
      where: {
        busId_stopId_tripDate: { busId, stopId, tripDate: today }
      },
      create: { busId, stopId, routeId, tripDate: today },
      update: { visitedAt: new Date() }
    });
  }
  
  /**
   * Get current stop statuses for a bus route
   */
  async getStopProgress(busId: number, routeId: number): Promise<StopStatus[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stops = await prisma.stop.findMany({
      where: { routeId },
      orderBy: { order: 'asc' }
    });
    
    const visits = await prisma.stopVisit.findMany({
      where: { busId, routeId, tripDate: today }
    });
    
    const visitedStopIds = new Set(visits.map(v => v.stopId));
    const busPosition = await this.getCurrentPosition(busId);
    
    // Find current stop (last visited or nearest)
    let currentStopId: number | null = null;
    const lastVisit = visits.sort((a, b) => 
      b.visitedAt.getTime() - a.visitedAt.getTime()
    )[0];
    
    if (lastVisit) {
      const lastVisitedIndex = stops.findIndex(s => s.id === lastVisit.stopId);
      if (lastVisitedIndex < stops.length - 1) {
        // If we just visited this stop in last 2 minutes, it's "current"
        const timeSinceVisit = Date.now() - lastVisit.visitedAt.getTime();
        if (timeSinceVisit < 2 * 60 * 1000) {
          currentStopId = lastVisit.stopId;
        }
      }
    }
    
    return stops.map(stop => {
      const visit = visits.find(v => v.stopId === stop.id);
      
      if (visit) {
        return {
          stopId: stop.id,
          status: stop.id === currentStopId ? 'current' : 'passed',
          passedAt: visit.visitedAt
        };
      }
      
      // Calculate ETA for upcoming stops
      const etaMinutes = busPosition 
        ? this.calculateETAMinutes(busPosition, stop)
        : undefined;
      
      return {
        stopId: stop.id,
        status: 'upcoming' as const,
        etaMinutes
      };
    });
  }
  
  /**
   * Emit stop progress via WebSocket
   */
  async emitStopProgress(busId: number, routeId: number): Promise<void> {
    const progress = await this.getStopProgress(busId, routeId);
    io.to(`bus-${busId}`).emit(`stop-progress:${busId}`, progress);
  }
  
  /**
   * Reset progress for a new trip (called at start of day or route change)
   */
  async resetTripProgress(busId: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    await prisma.stopVisit.deleteMany({
      where: { busId, tripDate: today }
    });
  }
}
```

#### Using Traccar Geofence Events (Alternative):
```typescript
// If using Traccar geofences instead of manual distance calculation
// Listen for geofenceEnter events from Traccar WebSocket

traccarSocket.on('message', (data) => {
  if (data.events) {
    for (const event of data.events) {
      if (event.type === 'geofenceEnter') {
        // Map Traccar geofenceId to our stopId
        const stopId = geofenceToStopMap.get(event.geofenceId);
        if (stopId) {
          stopProgressService.markStopVisited(
            event.deviceId, 
            stopId, 
            routeId
          );
        }
      }
    }
  }
});
```

#### API Endpoints:
```
GET  /api/tracking/:busId/stop-progress      # Get current stop statuses
POST /api/tracking/:busId/reset-progress     # Reset for new trip (admin)
GET  /api/tracking/:busId/trip-history/:date # Historical stop times
```

#### WebSocket Events:
```typescript
// Emitted events
io.emit(`stop-progress:${busId}`, StopStatus[]);

// Client subscribes
socket.on(`stop-progress:${busId}`, (statuses) => {
  // Update UI with passed/current/upcoming stops
});
```

#### Edge Cases to Handle:
| Scenario | Solution |
|----------|----------|
| Bus skips a stop | Mark as passed based on route order (if next stop visited) |
| Bus goes backwards | Only allow forward progression, ignore backward movement |
| GPS jumps | Require bus to be within geofence for > 10 seconds |
| Multiple routes | Track per-route-per-day, switch when route changes |
| Bus breakdown | Admin can manually mark stops |

---

### 3. Authentication & Security (High Priority)

#### Current:
- Basic JWT with no refresh
- No rate limiting
- Passwords stored (check hashing)

#### Improvements:

| Feature | Implementation |
|---------|----------------|
| **Refresh Tokens** | Issue short-lived access (15min) + long-lived refresh (7d) |
| **Token Rotation** | New refresh token on each use |
| **Rate Limiting** | express-rate-limit: 100 req/min per IP |
| **Password Hashing** | bcrypt with salt rounds 12 |
| **API Keys** | For school admin integrations |

#### New Auth Endpoints:
```
POST /api/auth/refresh          # Get new access token
POST /api/auth/logout-all       # Invalidate all sessions
POST /api/auth/forgot-password  # Send reset email
POST /api/auth/reset-password   # Reset with token
```

#### Middleware to Add:
```typescript
// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts'
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100
});
```

---

### 3. Notification System (High Priority)

#### Architecture:
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Bus Position│────▶│ Notification │────▶│   Channels  │
│   Update    │     │   Service    │     │ Push/SMS/WA │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  Triggers   │
                    │ - Geofence  │
                    │ - ETA < 5m  │
                    │ - Delay     │
                    │ - Arrival   │
                    └─────────────┘
```

#### Notification Service:
```typescript
// src/services/notification.service.ts
interface NotificationTrigger {
  type: 'GEOFENCE' | 'ETA_THRESHOLD' | 'DELAY' | 'ARRIVAL';
  busId: number;
  stopId?: number;
  threshold?: number; // meters or minutes
}

class NotificationService {
  async checkTriggers(busPosition: Position) {
    // Check geofence entries/exits
    // Check ETA thresholds
    // Detect delays
    // Send notifications via appropriate channel
  }
  
  async sendPush(userId: number, message: string) { }
  async sendSMS(phone: string, message: string) { }
  async sendWhatsApp(phone: string, message: string) { }
  async sendEmail(email: string, subject: string, body: string) { }
}
```

#### Third-party Services:
| Channel | Service | Cost |
|---------|---------|------|
| Push | Firebase FCM | Free |
| SMS | Twilio / MSG91 | ~₹0.20/SMS |
| WhatsApp | Twilio / Gupshup | ~₹0.50/msg |
| Email | SendGrid / AWS SES | Free tier available |

---

### 4. Database Optimizations (Medium Priority)

#### Current Schema Issues:
- No indexes on frequently queried fields
- No position history table
- No soft deletes

#### Recommended Changes:

```prisma
// prisma/schema.prisma additions

model PositionHistory {
  id        Int      @id @default(autoincrement())
  busId     Int
  bus       Bus      @relation(fields: [busId], references: [id])
  latitude  Float
  longitude Float
  speed     Float
  course    Float
  timestamp DateTime @default(now())
  
  @@index([busId, timestamp])
  @@index([timestamp])
}

model NotificationLog {
  id        Int      @id @default(autoincrement())
  parentId  Int
  parent    Parent   @relation(fields: [parentId], references: [id])
  type      NotificationType
  channel   String   // push, sms, email, whatsapp
  message   String
  status    String   // sent, delivered, failed
  sentAt    DateTime @default(now())
  
  @@index([parentId, sentAt])
}

// Add indexes to existing models
model Bus {
  // ... existing fields
  @@index([schoolId])
  @@index([traccarDeviceId])
}

model Student {
  // ... existing fields
  @@index([parentId])
  @@index([busId])
}
```

#### Data Archiving Strategy:
```typescript
// Archive positions older than 30 days
async function archiveOldPositions() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Move to archive table or cold storage
  await prisma.positionHistory.deleteMany({
    where: { timestamp: { lt: thirtyDaysAgo } }
  });
}

// Run daily via cron
```

---

### 5. Caching Layer (Medium Priority)

#### Redis Integration:
```typescript
// src/services/cache.service.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const CacheService = {
  // Cache bus positions (expires in 10 seconds)
  async setBusPosition(busId: number, position: Position) {
    await redis.setex(`bus:${busId}:position`, 10, JSON.stringify(position));
  },
  
  async getBusPosition(busId: number): Promise<Position | null> {
    const data = await redis.get(`bus:${busId}:position`);
    return data ? JSON.parse(data) : null;
  },
  
  // Cache route data (expires in 1 hour)
  async setRoute(routeId: number, route: Route) {
    await redis.setex(`route:${routeId}`, 3600, JSON.stringify(route));
  },
  
  // Cache user sessions
  async setSession(userId: number, token: string) {
    await redis.setex(`session:${userId}`, 86400, token);
  }
};
```

#### What to Cache:
| Data | TTL | Reason |
|------|-----|--------|
| Bus positions | 10s | Frequently accessed, changes often |
| Routes | 1h | Rarely changes |
| Stops | 1h | Rarely changes |
| User sessions | 24h | Auth validation |
| ETA calculations | 30s | Expensive to compute |

---

### 6. Admin API Routes (Medium Priority)

#### New Routes:
```typescript
// src/routes/admin.routes.ts

// Fleet Management
GET    /api/admin/buses              # All buses with status
POST   /api/admin/buses              # Add new bus
PUT    /api/admin/buses/:id          # Update bus
DELETE /api/admin/buses/:id          # Remove bus

// Route Management
GET    /api/admin/routes             # All routes
POST   /api/admin/routes             # Create route
PUT    /api/admin/routes/:id         # Update route
POST   /api/admin/routes/:id/stops   # Add stop to route

// Student Management
GET    /api/admin/students           # All students
POST   /api/admin/students/bulk      # Bulk import (CSV)
PUT    /api/admin/students/:id/bus   # Assign bus

// Reports
GET    /api/admin/reports/delays     # Delay report
GET    /api/admin/reports/attendance # Driver attendance
GET    /api/admin/reports/trips      # Trip history

// Notifications
POST   /api/admin/notifications/broadcast  # Send to all parents
```

---

### 7. WebSocket Enhancements (Low Priority)

#### Current:
- Basic position forwarding from Traccar

#### Improvements:
```typescript
// Enhanced socket events
io.on('connection', (socket) => {
  // Existing
  socket.on('join-bus', (busId) => { });
  
  // New events
  socket.on('subscribe-route', (routeId) => {
    // Get updates for all buses on a route
  });
  
  socket.on('subscribe-child', (childId) => {
    // Get updates for specific child's bus
  });
  
  // Emit richer data
  socket.emit('bus-update', {
    busId,
    position: { lat, lng, speed, course },
    eta: { stopId, minutes },
    status: 'moving' | 'stopped' | 'delayed',
    nextStop: { id, name, eta }
  });
});
```

---

## 🔧 Infrastructure

### Docker Setup:
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/bustrack
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=bustrack
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
  
  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

### Environment Variables:
```env
# .env.example additions
REDIS_URL=redis://localhost:6379

# Notifications
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE=
SENDGRID_API_KEY=

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

---

## 📋 Implementation Priority

| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| Refresh tokens | High | Low | 🔴 Week 1 |
| Rate limiting | High | Low | 🔴 Week 1 |
| Real ETA calculation | High | Medium | 🔴 Week 1-2 |
| Push notifications (FCM) | High | Medium | 🟡 Week 2-3 |
| Redis caching | Medium | Medium | 🟡 Week 3 |
| Database indexes | Medium | Low | 🟡 Week 3 |
| Admin routes | Medium | High | 🟢 Week 4-5 |
| Position archiving | Low | Low | 🟢 Week 5 |
| Docker setup | Medium | Medium | 🟢 Week 5 |

---

## 🧪 Testing Strategy

### Unit Tests:
```bash
npm install -D jest @types/jest ts-jest
```

```typescript
// src/services/__tests__/eta.service.test.ts
describe('ETA Service', () => {
  test('calculates basic ETA correctly', () => {
    const eta = calculateEta(busPosition, stopPosition, 30);
    expect(eta).toBeGreaterThan(0);
  });
  
  test('applies traffic multiplier during rush hour', () => {
    // ...
  });
});
```

### Integration Tests:
- Test Traccar connection
- Test Socket.IO events
- Test API endpoints with supertest

### Load Testing:
```bash
# Using k6 or artillery
artillery quick --count 100 --num 50 http://localhost:3001/api/health
```

---

*Last updated: January 2026*
*Version: 1.0*
