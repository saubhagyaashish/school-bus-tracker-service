/**
 * Bus Simulator Service
 * Simulates buses moving along routes for testing/demo purposes
 */

import { Server as SocketIOServer } from 'socket.io';

interface SimulatedBus {
    id: number;
    deviceId: number;
    name: string;
    route: { lat: number; lng: number }[];
    currentIndex: number;
    speed: number; // km/h
    direction: 1 | -1; // 1 = forward, -1 = backward
}

// Sample route coordinates (Delhi area)
const ROUTE_A: { lat: number; lng: number }[] = [
    { lat: 28.5672, lng: 77.2100 }, // Green Park
    { lat: 28.5690, lng: 77.2120 },
    { lat: 28.5710, lng: 77.2150 },
    { lat: 28.5730, lng: 77.2180 },
    { lat: 28.5750, lng: 77.2200 }, // Lajpat Nagar
    { lat: 28.5770, lng: 77.2230 },
    { lat: 28.5790, lng: 77.2260 },
    { lat: 28.5810, lng: 77.2290 },
    { lat: 28.5830, lng: 77.2320 },
    { lat: 28.5850, lng: 77.2350 }, // Hauz Khas
    { lat: 28.5870, lng: 77.2380 },
    { lat: 28.5890, lng: 77.2410 },
    { lat: 28.5910, lng: 77.2440 },
    { lat: 28.5930, lng: 77.2470 },
    { lat: 28.5950, lng: 77.2500 }, // School
];

const ROUTE_B: { lat: number; lng: number }[] = [
    { lat: 28.5500, lng: 77.2000 }, // Saket
    { lat: 28.5530, lng: 77.2030 },
    { lat: 28.5560, lng: 77.2060 },
    { lat: 28.5590, lng: 77.2090 },
    { lat: 28.5620, lng: 77.2120 },
    { lat: 28.5650, lng: 77.2150 },
    { lat: 28.5680, lng: 77.2180 },
    { lat: 28.5710, lng: 77.2210 },
    { lat: 28.5740, lng: 77.2240 },
    { lat: 28.5770, lng: 77.2270 },
    { lat: 28.5800, lng: 77.2300 },
    { lat: 28.5830, lng: 77.2330 },
    { lat: 28.5860, lng: 77.2360 },
    { lat: 28.5890, lng: 77.2390 },
    { lat: 28.5920, lng: 77.2420 },
    { lat: 28.5950, lng: 77.2500 }, // School
];

// Simulated buses
const buses: SimulatedBus[] = [
    {
        id: 1,
        deviceId: 1,
        name: 'Bus 101',
        route: ROUTE_A,
        currentIndex: 0,
        speed: 25,
        direction: 1,
    },
    {
        id: 2,
        deviceId: 2,
        name: 'Bus 102',
        route: ROUTE_B,
        currentIndex: 5,
        speed: 30,
        direction: 1,
    },
];

let simulationInterval: NodeJS.Timeout | null = null;
let io: SocketIOServer | null = null;

/**
 * Calculate bearing between two points
 */
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

/**
 * Add some randomness to position (simulates GPS jitter)
 */
function addJitter(value: number, amount: number = 0.0001): number {
    return value + (Math.random() - 0.5) * amount;
}

/**
 * Update bus positions
 */
function updateBusPositions(): void {
    const positions = buses.map(bus => {
        // Move to next point
        bus.currentIndex += bus.direction;

        // Reverse direction at route ends
        if (bus.currentIndex >= bus.route.length - 1) {
            bus.direction = -1;
            bus.currentIndex = bus.route.length - 1;
        } else if (bus.currentIndex <= 0) {
            bus.direction = 1;
            bus.currentIndex = 0;
        }

        const currentPoint = bus.route[bus.currentIndex];
        const nextIndex = Math.min(bus.currentIndex + bus.direction, bus.route.length - 1);
        const nextPoint = bus.route[Math.max(0, nextIndex)];

        // Calculate course/heading
        const course = calculateBearing(
            currentPoint.lat, currentPoint.lng,
            nextPoint.lat, nextPoint.lng
        );

        // Add slight speed variation
        const speedVariation = bus.speed + (Math.random() - 0.5) * 10;

        return {
            id: bus.id,
            deviceId: bus.deviceId,
            latitude: addJitter(currentPoint.lat),
            longitude: addJitter(currentPoint.lng),
            speed: Math.max(0, speedVariation) / 1.852, // Convert to knots (Traccar format)
            course: course,
            fixTime: new Date().toISOString(),
            valid: true,
            attributes: {},
        };
    });

    // Also send device status updates
    const devices = buses.map(bus => ({
        id: bus.deviceId,
        name: bus.name,
        uniqueId: `BUS${bus.deviceId.toString().padStart(3, '0')}`,
        status: 'online',
        lastUpdate: new Date().toISOString(),
        positionId: bus.id,
    }));

    // Emit to all connected clients
    if (io) {
        io.emit('positions', positions);
        io.emit('devices', devices);
        console.log(`📍 Simulated ${positions.length} bus positions`);
    }
}

/**
 * Start the bus simulator
 */
export function startBusSimulator(socketIo: SocketIOServer, intervalMs: number = 2000): void {
    io = socketIo;
    
    if (simulationInterval) {
        console.log('⚠️ Simulator already running');
        return;
    }

    console.log('🚌 Starting bus simulator...');
    console.log(`   Simulating ${buses.length} buses`);
    console.log(`   Update interval: ${intervalMs}ms`);

    // Send initial positions immediately
    updateBusPositions();

    // Start simulation loop
    simulationInterval = setInterval(updateBusPositions, intervalMs);

    console.log('✅ Bus simulator started');
}

/**
 * Stop the bus simulator
 */
export function stopBusSimulator(): void {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        console.log('🛑 Bus simulator stopped');
    }
}

/**
 * Get current simulated bus data
 */
export function getSimulatedBuses(): SimulatedBus[] {
    return buses;
}
