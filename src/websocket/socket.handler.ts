import { Server as SocketIOServer, Socket } from 'socket.io';
import WebSocket from 'ws';
import { startBusSimulator, stopBusSimulator } from '../services/bus-simulator';

// Native fetch is available in Node.js 18+
// If running on older Node, we might need 'node-fetch' but let's assume modern Node given the project setup.

/**
 * WebSocket handler for real-time bus tracking
 * Bridges Traccar WebSocket with client connections
 */

let traccarWs: WebSocket | null = null;
let io: SocketIOServer | null = null;

/**
 * Connect to Traccar WebSocket using Session Cookie
 */
async function connectToTraccar() {
    const apiUrl = process.env.TRACCAR_API_URL || 'http://localhost:8082/api';
    const wsUrl = process.env.TRACCAR_WS_URL || 'ws://localhost:8082/api/socket';

    // Explicitly trim credentials to avoid issues with .env extra spaces/quotes
    const email = (process.env.TRACCAR_USER || 'admin').replace(/['"]/g, '').trim();
    const password = (process.env.TRACCAR_PASSWORD || 'admin').replace(/['"]/g, '').trim();

    console.log(`🔌 Connecting to Traccar WebSocket (${wsUrl})...`);
    console.log(`👤 Login User: ${email}`);

    try {
        // 1. Authenticate via POST /session to get the cookie
        // Use native fetch for simplicity and control
        const params = new URLSearchParams();
        params.append('email', email);
        params.append('password', password);

        // Try Form Data (Standard)
        const response = await fetch(`${apiUrl}/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            console.error(`❌ Traccar Login Failed: ${response.status} ${response.statusText}`);
            // Retry in 5s
            setTimeout(connectToTraccar, 5000);
            return;
        }

        // Extract cookie
        const cookieHeader = response.headers.get('set-cookie');

        if (!cookieHeader) {
            console.warn('⚠️ Login successful but no Set-Cookie header received.');
        } else {
            console.log('🔑 Authenticated with Traccar. Session ID obtained.');
        }

        // 2. Connect to WebSocket with Cookie
        traccarWs = new WebSocket(wsUrl, {
            headers: {
                'Cookie': cookieHeader || ''
            },
        });

        traccarWs.on('open', () => {
            console.log('✅ Connected to Traccar WebSocket');
        });

        traccarWs.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());

                if (io) {
                    if (message.positions) io.emit('positions', message.positions);
                    if (message.devices) io.emit('devices', message.devices);
                    if (message.events) io.emit('events', message.events);
                }
            } catch (error) {
                console.error('Error parsing Traccar message:', error);
            }
        });

        traccarWs.on('close', (code, reason) => {
            console.log(`❌ Traccar WebSocket disconnected (Code: ${code}). Reconnecting in 5s...`);
            traccarWs = null;
            setTimeout(connectToTraccar, 5000);
        });

        traccarWs.on('error', (error) => {
            console.error('Traccar WebSocket error:', error.message);
        });

    } catch (error: any) {
        console.error('❌ Failed to connect to Traccar:', error.message);
        
        // If simulation mode is enabled, start the simulator instead of retrying Traccar
        if (process.env.ENABLE_SIMULATION === 'true' && io) {
            console.log('🎮 Traccar unavailable - Starting bus simulator instead...');
            startBusSimulator(io, 2000);
        } else {
            setTimeout(connectToTraccar, 5000);
        }
    }
}

/**
 * Setup Socket.IO for client connections
 */
export function setupWebSocket(socketIo: SocketIOServer) {
    io = socketIo;

    io.on('connection', (socket: Socket) => {
        console.log(`📱 Client connected: ${socket.id}`);

        socket.on('join-bus', (busId: number) => {
            socket.join(`bus-${busId}`);
            console.log(`Client ${socket.id} joined bus-${busId}`);
        });

        socket.on('leave-bus', (busId: number) => {
            socket.leave(`bus-${busId}`);
            console.log(`Client ${socket.id} left bus-${busId}`);
        });

        socket.on('join-route', (routeId: number) => {
            socket.join(`route-${routeId}`);
            console.log(`Client ${socket.id} joined route-${routeId}`);
        });

        socket.on('disconnect', () => {
            console.log(`📴 Client disconnected: ${socket.id}`);
        });
    });

    connectToTraccar();
}

export function emitEtaUpdate(busId: number, stopId: number, etaMinutes: number) {
    if (io) {
        io.to(`bus-${busId}`).emit('eta-update', {
            busId, stopId, etaMinutes, timestamp: new Date().toISOString()
        });
    }
}

export function emitBusArriving(busId: number, stopId: number, minutesAway: number) {
    if (io) {
        io.to(`bus-${busId}`).emit('bus-arriving', {
            busId, stopId, minutesAway, message: `Bus arriving in ${minutesAway} minutes`, timestamp: new Date().toISOString()
        });
    }
}
