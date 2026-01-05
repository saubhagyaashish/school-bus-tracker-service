import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes';
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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
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
    console.log(`🗺️  Traccar API: ${process.env.TRACCAR_API_URL}`);
});

export { io };
