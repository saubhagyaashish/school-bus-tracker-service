# 🔐 RBAC, Multi-Tenancy & Driver App Implementation Guide

> Role-Based Access Control, Multi-School Support, and Driver App features for School Bus Tracker

---

## 📋 Overview

This document outlines the implementation plan for:
1. **Multi-Tenancy** - Multiple schools (tenants) on one platform
2. **Role-Based Access Control (RBAC)** - Different permissions for Super Admin, Admin, Driver, and Parent
3. **Driver App Features** - Shift management, attendance tracking, route control

---

## 🏢 Multi-Tenancy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SUPER ADMIN                                 │
│  • Create/manage Schools (tenants)                              │
│  • Onboard School Admins                                        │
│  • View all data across schools                                  │
│  • Platform-level analytics & billing                           │
├─────────────────────────────────────────────────────────────────┤
│     SCHOOL A (Tenant)          │     SCHOOL B (Tenant)          │
│  ┌───────────────────────────┐ │  ┌───────────────────────────┐ │
│  │ Admin: Mr. Sharma         │ │  │ Admin: Mrs. Gupta         │ │
│  │ Buses: 101, 102, 103      │ │  │ Buses: 201, 202           │ │
│  │ Parents: 150              │ │  │ Parents: 80               │ │
│  │ Drivers: 8                │ │  │ Drivers: 4                │ │
│  │ Students: 300             │ │  │ Students: 150             │ │
│  └───────────────────────────┘ │  └───────────────────────────┘ │
│                                │                                 │
│  🔒 Isolated Data              │  🔒 Isolated Data              │
└────────────────────────────────┴─────────────────────────────────┘
```

### Key Principles:
- **Data Isolation**: School A cannot see School B's data
- **School Selection at Signup**: Users must select their school (from SuperAdmin-created list)
- **Automatic Filtering**: All queries automatically filter by `schoolId`

---

## 🎭 User Roles

| Role | Scope | Description | Can Access |
|------|-------|-------------|------------|
| **SUPER_ADMIN** | Platform | Platform owner | Create schools, assign admins, view all data |
| **ADMIN** | Single School | School staff | Full CRUD on their school's resources |
| **DRIVER** | Single School | Bus driver | Own bus, route, shift, attendance |
| **PARENT** | Single School | Parent/Guardian | Own children, their bus tracking |

---

## 📊 Database Schema Changes

### Updated User Model with Multi-Tenancy

```prisma
// prisma/schema.prisma

enum UserRole {
  SUPER_ADMIN   // Platform-level access
  ADMIN         // School-level admin
  DRIVER        // Bus driver
  PARENT        // Parent/Guardian
}

model User {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  phone        String?
  passwordHash String
  name         String
  role         UserRole  @default(PARENT)
  schoolId     Int?      // NULL for SUPER_ADMIN (platform-wide)
  school       School?   @relation(fields: [schoolId], references: [id])
  isActive     Boolean   @default(true)
  fcmToken     String?   // Push notifications
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  
  // Role-specific relations
  driverProfile  DriverProfile?
  
  @@index([email])
  @@index([role])
  @@index([schoolId])
}

model School {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  code        String   @unique  // Short code like "DPS-DELHI"
  address     String?
  phone       String?
  email       String?
  logo        String?           // URL to school logo
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById Int?              // SuperAdmin who created this school
  
  // Relations
  users       User[]
  buses       Bus[]
  routes      Route[]
  students    Student[]
  
  @@index([code])
}

model DriverProfile {
  id            Int      @id @default(autoincrement())
  userId        Int      @unique
  user          User     @relation(fields: [userId], references: [id])
  licenseNumber String?
  assignedBusId Int?
  assignedBus   Bus?     @relation(fields: [assignedBusId], references: [id])
  
  shifts        Shift[]
}
```

### Key Schema Changes:
1. **`UserRole` enum** now includes `SUPER_ADMIN`
2. **`User.schoolId`** is nullable (NULL for Super Admin)
3. **`School` model** includes `code` for easy identification
4. Every tenant-scoped model has `schoolId` for filtering
```

### Option B: Add Auth to Existing Driver Model

```prisma
model Driver {
  id           Int      @id @default(autoincrement())
  name         String
  phone        String
  email        String?  @unique  // NEW
  passwordHash String?           // NEW
  isActive     Boolean  @default(true)  // NEW
  // ... rest unchanged
}
```

---

## 🚌 Shift Management

### Schema Addition

```prisma
model Shift {
  id          Int       @id @default(autoincrement())
  driverId    Int
  driver      DriverProfile @relation(fields: [driverId], references: [id])
  busId       Int
  bus         Bus       @relation(fields: [busId], references: [id])
  routeId     Int
  route       Route     @relation(fields: [routeId], references: [id])
  type        ShiftType
  status      ShiftStatus @default(NOT_STARTED)
  startedAt   DateTime?
  endedAt     DateTime?
  startOdometer Int?
  endOdometer   Int?
  notes       String?
  createdAt   DateTime  @default(now())
  
  attendance  Attendance[]
  
  @@index([driverId, createdAt])
  @@index([busId, createdAt])
}

enum ShiftType {
  MORNING
  AFTERNOON
}

enum ShiftStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

---

## 👦 Attendance Tracking

### Schema Addition

```prisma
model Attendance {
  id          Int            @id @default(autoincrement())
  shiftId     Int
  shift       Shift          @relation(fields: [shiftId], references: [id])
  studentId   Int
  student     Student        @relation(fields: [studentId], references: [id])
  stopId      Int
  stop        Stop           @relation(fields: [stopId], references: [id])
  status      AttendanceStatus
  timestamp   DateTime       @default(now())
  markedById  Int            // Driver who marked it
  notes       String?
  
  @@unique([shiftId, studentId])  // One record per student per shift
  @@index([shiftId])
  @@index([studentId])
}

enum AttendanceStatus {
  BOARDED       // Child got on the bus
  DROPPED       // Child got off the bus
  ABSENT        // Child marked absent (by parent or driver)
  NO_SHOW       // Expected but didn't show up
}
```

---

## 🛡️ Auth Middleware

### File: `src/middleware/auth.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

interface JWTPayload {
  userId: number;
  role: 'ADMIN' | 'DRIVER' | 'PARENT';
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: number; email: string; name: string };
    }
  }
}

/**
 * Verify JWT and attach user to request
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    const user = await prisma.user.findUnique({ 
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Require specific roles
 */
export function requireRole(...roles: ('ADMIN' | 'DRIVER' | 'PARENT')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * Shorthand middleware
 */
export const adminOnly = requireRole('ADMIN');
export const driverOnly = requireRole('DRIVER');
export const parentOnly = requireRole('PARENT');
export const driverOrAdmin = requireRole('DRIVER', 'ADMIN');
```

---

## 🚗 Driver API Endpoints

### File: `src/routes/driver.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate, driverOnly, driverOrAdmin } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/driver/me
 * Get current driver's profile and assigned bus/route
 */
router.get('/me', driverOnly, async (req, res) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      assignedBus: true,
      shifts: {
        where: { status: 'IN_PROGRESS' },
        take: 1
      }
    }
  });
  res.json(profile);
});

/**
 * POST /api/driver/shift/start
 * Start a new shift (morning/afternoon)
 */
router.post('/shift/start', driverOnly, async (req, res) => {
  const { routeId, type } = req.body; // type: MORNING | AFTERNOON
  
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id }
  });
  
  if (!profile?.assignedBusId) {
    return res.status(400).json({ error: 'No bus assigned' });
  }
  
  // Check for existing active shift
  const existingShift = await prisma.shift.findFirst({
    where: { driverId: profile.id, status: 'IN_PROGRESS' }
  });
  
  if (existingShift) {
    return res.status(400).json({ error: 'Shift already in progress' });
  }
  
  const shift = await prisma.shift.create({
    data: {
      driverId: profile.id,
      busId: profile.assignedBusId,
      routeId,
      type,
      status: 'IN_PROGRESS',
      startedAt: new Date()
    }
  });
  
  // Optional: Increase GPS reporting frequency via Traccar
  // await traccarService.sendCommand(busId, 'positionPeriodic', { frequency: 10 });
  
  res.json({ success: true, shift });
});

/**
 * POST /api/driver/shift/end
 * End current shift
 */
router.post('/shift/end', driverOnly, async (req, res) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id }
  });
  
  const shift = await prisma.shift.findFirst({
    where: { driverId: profile!.id, status: 'IN_PROGRESS' }
  });
  
  if (!shift) {
    return res.status(400).json({ error: 'No active shift' });
  }
  
  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: 'COMPLETED',
      endedAt: new Date()
    }
  });
  
  res.json({ success: true, shift: updated });
});

/**
 * GET /api/driver/shift/current
 * Get current active shift with students
 */
router.get('/shift/current', driverOnly, async (req, res) => {
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id }
  });
  
  const shift = await prisma.shift.findFirst({
    where: { driverId: profile!.id, status: 'IN_PROGRESS' },
    include: {
      route: {
        include: {
          stops: {
            orderBy: { stopOrder: 'asc' },
            include: {
              students: true
            }
          }
        }
      },
      attendance: true
    }
  });
  
  res.json(shift);
});

/**
 * POST /api/driver/attendance
 * Mark student attendance (boarded/dropped/absent)
 */
router.post('/attendance', driverOnly, async (req, res) => {
  const { studentId, stopId, status } = req.body;
  
  const profile = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id }
  });
  
  const shift = await prisma.shift.findFirst({
    where: { driverId: profile!.id, status: 'IN_PROGRESS' }
  });
  
  if (!shift) {
    return res.status(400).json({ error: 'No active shift' });
  }
  
  const attendance = await prisma.attendance.upsert({
    where: {
      shiftId_studentId: { shiftId: shift.id, studentId }
    },
    create: {
      shiftId: shift.id,
      studentId,
      stopId,
      status,
      markedById: req.user!.id
    },
    update: {
      status,
      stopId,
      timestamp: new Date()
    }
  });
  
  // Emit event to parents
  io.to(`student-${studentId}`).emit('attendance', {
    studentId,
    status,
    time: new Date()
  });
  
  res.json({ success: true, attendance });
});

/**
 * GET /api/driver/route/:routeId/students
 * Get all students for a route, grouped by stop
 */
router.get('/route/:routeId/students', driverOnly, async (req, res) => {
  const stops = await prisma.stop.findMany({
    where: { routeId: parseInt(req.params.routeId) },
    orderBy: { stopOrder: 'asc' },
    include: {
      students: {
        select: {
          id: true,
          name: true,
          grade: true,
          parent: { select: { name: true, phone: true } }
        }
      }
    }
  });
  
  res.json(stops);
});

export default router;
```

---

## 🔐 Protected Route Examples

```typescript
// src/routes/index.ts
import { authenticate, adminOnly, driverOrAdmin } from '../middleware/auth.middleware';

// Public routes (no auth)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/driver', authenticate, driverRoutes);
app.use('/api/admin', authenticate, adminOnly, adminRoutes);

// Mixed access
app.use('/api/buses', authenticate, busRoutes);
app.use('/api/students', authenticate, studentRoutes);

// Route-level protection
router.get('/buses', authenticate, (req, res) => { /* any logged-in user */ });
router.post('/buses', authenticate, adminOnly, (req, res) => { /* admin only */ });
router.put('/buses/:id', authenticate, driverOrAdmin, (req, res) => { /* driver or admin */ });
```

---

## 📱 Driver App Screens

### 1. Login Screen
- Email/phone + password
- Remember me option

### 2. Dashboard
```
┌─────────────────────────────────────┐
│  Good Morning, Ramesh               │
│  Bus 101 • Morning Route A          │
├─────────────────────────────────────┤
│  [🟢 START SHIFT]                   │
│                                     │
│  Today's Route:                     │
│  • Green Park (5 students)          │
│  • Lajpat Nagar (3 students)        │
│  • Hauz Khas (4 students)           │
│  • ABC School                       │
│                                     │
│  Total: 12 students                 │
└─────────────────────────────────────┘
```

### 3. Active Shift Screen
```
┌─────────────────────────────────────┐
│  SHIFT IN PROGRESS • 45 min        │
│  Next Stop: Lajpat Nagar (3 kids)  │
├─────────────────────────────────────┤
│  Boarded: 5/12 students            │
│                                     │
│  Current Stop: Green Park          │
│  ┌───────────────────────────────┐ │
│  │ ✅ Rahul Sharma    [BOARDED]  │ │
│  │ ✅ Priya Singh     [BOARDED]  │ │
│  │ ⬜ Amit Kumar      [MARK]     │ │
│  └───────────────────────────────┘ │
│                                     │
│  [➡️ NEXT STOP]  [🚨 REPORT ISSUE] │
└─────────────────────────────────────┘
```

### 4. Student List at Stop
```
┌─────────────────────────────────────┐
│  Green Park Stop                   │
│  5 students assigned               │
├─────────────────────────────────────┤
│  👦 Rahul Sharma (Class 5A)        │
│     Parent: Mrs. Sharma            │
│     📞 9876543210                  │
│     [BOARDED] [ABSENT]             │
├─────────────────────────────────────┤
│  👧 Priya Singh (Class 4B)         │
│     Parent: Mr. Singh              │
│     📞 9876543211                  │
│     [BOARDED] [ABSENT]             │
└─────────────────────────────────────┘
```

---

## 📡 WebSocket Events

### Driver App Events
```typescript
// When driver starts shift
io.emit('shift-started', { busId, driverId, routeId });

// When student boards
io.to(`bus-${busId}`).emit('student-boarded', { studentId, stopId });

// When driver marks next stop
io.to(`bus-${busId}`).emit('stop-changed', { currentStopId, nextStopId });
```

### Parent App Events
```typescript
// Parent subscribes to their child
socket.join(`student-${childId}`);

// Receives attendance updates
socket.on('attendance', (data) => {
  // { studentId, status: 'BOARDED', time }
});
```

---

## 📋 Implementation Checklist

### Phase 0: Multi-Tenancy Foundation (NEW)
- [ ] Add `SUPER_ADMIN` to UserRole enum
- [ ] Add `schoolId` to User model (nullable for SuperAdmin)
- [ ] Update School model with `code` field
- [ ] Create tenant middleware
- [ ] Add school CRUD endpoints (SuperAdmin only)
- [ ] Create first SuperAdmin account via seed script

### Phase 1: Auth & RBAC
- [ ] Add User model with role enum
- [ ] Migrate existing Parent data to User
- [ ] Add Driver auth (email/password)
- [ ] Implement JWT authentication
- [ ] Create auth middleware with role + tenant checks
- [ ] Protect existing routes

### Phase 2: Shift Management
- [ ] Add Shift model
- [ ] Create driver.routes.ts
- [ ] Implement start/end shift
- [ ] Connect to Traccar GPS control

### Phase 3: Attendance
- [ ] Add Attendance model
- [ ] Implement attendance marking
- [ ] WebSocket events to parents
- [ ] Push notifications for boarding

### Phase 4: Driver App UI
- [ ] Login screen
- [ ] Dashboard with route overview
- [ ] Active shift screen
- [ ] Student list per stop
- [ ] Attendance marking interface

### Phase 5: Super Admin Dashboard
- [ ] School management UI
- [ ] Admin onboarding flow
- [ ] Platform analytics
- [ ] Cross-school reporting

---

## 🔒 Tenant Middleware

### File: `src/middleware/tenant.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Middleware
 * Automatically filters all queries by schoolId
 * SuperAdmin can optionally specify schoolId to view specific school
 */
export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Super Admin can access all schools
  if (req.user.role === 'SUPER_ADMIN') {
    // Optionally filter by schoolId from query param
    req.tenantId = req.query.schoolId 
      ? parseInt(req.query.schoolId as string) 
      : null; // null = all schools
  } else {
    // Other roles are locked to their school
    req.tenantId = req.user.schoolId;
    
    if (!req.tenantId) {
      return res.status(403).json({ error: 'No school assigned' });
    }
  }
  
  next();
}

// TypeScript declaration
declare global {
  namespace Express {
    interface Request {
      tenantId?: number | null;
    }
  }
}
```

### Using Tenant Filter in Queries:

```typescript
// All queries automatically filter by tenant
router.get('/buses', authenticate, tenantMiddleware, async (req, res) => {
  const buses = await prisma.bus.findMany({
    where: req.tenantId ? { schoolId: req.tenantId } : {}
  });
  res.json(buses);
});

// Helper function for tenant queries
function tenantWhere(req: Request, additionalFilters = {}) {
  return {
    ...additionalFilters,
    ...(req.tenantId ? { schoolId: req.tenantId } : {})
  };
}

// Usage
const students = await prisma.student.findMany({
  where: tenantWhere(req, { busId: parseInt(req.params.busId) })
});
```

---

## � Super Admin API Endpoints

### File: `src/routes/superadmin.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All routes require SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole('SUPER_ADMIN'));

/**
 * GET /api/superadmin/schools
 * List all schools
 */
router.get('/schools', async (req, res) => {
  const schools = await prisma.school.findMany({
    include: {
      _count: {
        select: { users: true, buses: true, students: true }
      }
    }
  });
  res.json(schools);
});

/**
 * POST /api/superadmin/schools
 * Create a new school
 */
router.post('/schools', async (req, res) => {
  const { name, code, address, phone, email } = req.body;
  
  const school = await prisma.school.create({
    data: {
      name,
      code: code.toUpperCase(),
      address,
      phone,
      email,
      createdById: req.user!.id
    }
  });
  
  res.json({ success: true, school });
});

/**
 * POST /api/superadmin/schools/:id/admin
 * Invite/create admin for a school
 */
router.post('/schools/:id/admin', async (req, res) => {
  const { email, name, phone } = req.body;
  const schoolId = parseInt(req.params.id);
  
  // Generate temporary password or send invite link
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      phone,
      passwordHash,
      role: 'ADMIN',
      schoolId
    }
  });
  
  // TODO: Send email with temp password / invite link
  
  res.json({ success: true, admin: { id: admin.id, email: admin.email } });
});

/**
 * GET /api/superadmin/stats
 * Platform-wide statistics
 */
router.get('/stats', async (req, res) => {
  const [schools, users, buses, students] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.bus.count(),
    prisma.student.count()
  ]);
  
  res.json({
    totalSchools: schools,
    totalUsers: users,
    totalBuses: buses,
    totalStudents: students
  });
});

export default router;
```

---

## 📝 Registration Flow

### School Selection Dropdown

```typescript
// GET /api/auth/schools (Public endpoint)
// Returns list of active schools for signup dropdown
router.get('/schools', async (req, res) => {
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true }
  });
  res.json(schools);
});
```

### Updated Registration

```typescript
// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, phone, password, schoolId, role } = req.body;
  
  // Validate school exists
  const school = await prisma.school.findUnique({ 
    where: { id: schoolId, isActive: true } 
  });
  
  if (!school) {
    return res.status(400).json({ error: 'Invalid school' });
  }
  
  // Only PARENT and DRIVER can self-register
  // ADMIN must be created by SUPER_ADMIN
  if (!['PARENT', 'DRIVER'].includes(role)) {
    return res.status(403).json({ error: 'Cannot register with this role' });
  }
  
  const passwordHash = await bcrypt.hash(password, 12);
  
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role,
      schoolId
    }
  });
  
  res.json({ success: true, user: { id: user.id, email: user.email } });
});
```

### Registration Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Registration Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [User visits signup page]                                   │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────┐                    │
│  │ Step 1: Select Your School          │                    │
│  │ ┌─────────────────────────────────┐ │                    │
│  │ │ ▼ Select School                 │ │                    │
│  │ │   • Delhi Public School         │ │                    │
│  │ │   • St. Mary's Convent          │ │                    │
│  │ │   • Modern School               │ │                    │
│  │ └─────────────────────────────────┘ │                    │
│  └─────────────────────────────────────┘                    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────┐                    │
│  │ Step 2: I am a...                   │                    │
│  │   [👨‍👩‍👧 Parent]  [🚌 Driver]          │                    │
│  └─────────────────────────────────────┘                    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────┐                    │
│  │ Step 3: Your Details                │                    │
│  │   Name: [_______________]           │                    │
│  │   Email: [______________]           │                    │
│  │   Phone: [______________]           │                    │
│  │   Password: [___________]           │                    │
│  │                                     │                    │
│  │   [Create Account]                  │                    │
│  └─────────────────────────────────────┘                    │
│           │                                                  │
│           ▼                                                  │
│  [Account created → Linked to selected school]              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ⏱️ Time Estimates

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 0: Multi-Tenancy** | Schema, middleware, school CRUD | 2-3 days |
| **Phase 1: Auth & RBAC** | JWT, roles, protected routes | 3-4 days |
| **Phase 2: Shift Management** | Shift model, start/end APIs | 2-3 days |
| **Phase 3: Attendance** | Attendance model, WebSocket events | 2 days |
| **Phase 4: Driver App UI** | Mobile screens | 4-5 days |
| **Phase 5: Super Admin UI** | School management dashboard | 3-4 days |

**Total Estimated: ~3-4 weeks**

---

## �🔗 Dependencies to Add

```bash
npm install jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

---

## 🌱 Seed Script for Super Admin

```typescript
// prisma/seed.ts
async function main() {
  const passwordHash = await bcrypt.hash('superadmin123', 12);
  
  await prisma.user.upsert({
    where: { email: 'superadmin@bustracker.com' },
    update: {},
    create: {
      email: 'superadmin@bustracker.com',
      name: 'Platform Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      schoolId: null  // Platform-wide access
    }
  });
  
  console.log('✅ Super Admin created');
}
```

---

*Last updated: January 2026*

