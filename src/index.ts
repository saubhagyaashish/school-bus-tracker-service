import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

// Load environment variables
dotenv.config();

// Import Swagger config
import { swaggerSpec } from './config/swagger';

// Import routes
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import driverRoutes from './routes/driver.routes';
import busRoutes from './routes/bus.routes';
import routeRoutes from './routes/route.routes';
import stopRoutes from './routes/stop.routes';
import studentRoutes from './routes/student.routes';
import trackingRoutes from './routes/tracking.routes';
import simulatorRoutes from './routes/simulator.routes';

// Import WebSocket handler
import { setupWebSocket } from './websocket/socket.handler';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'School Bus Tracker API',
}));

// Swagger JSON spec
app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/simulator', simulatorRoutes);

// WebSocket setup
setupWebSocket(io);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚌 School Bus Tracker API running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
    console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
});

export { io };

