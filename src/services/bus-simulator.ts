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

// Sample route coordinates (Bihar - Patna area)
// Route A: Bailey Road to Patna Junction via Gandhi Maidan
const ROUTE_A: { lat: number; lng: number }[] = [
    { lat: 25.5941, lng: 85.1376 }, // Bailey Road (Start)
    { lat: 25.5955, lng: 85.1390 },
    { lat: 25.5968, lng: 85.1405 },
    { lat: 25.5982, lng: 85.1420 },
    { lat: 25.5995, lng: 85.1435 }, // Near Patna Zoo
    { lat: 25.6008, lng: 85.1450 },
    { lat: 25.6020, lng: 85.1465 },
    { lat: 25.6035, lng: 85.1480 },
    { lat: 25.6048, lng: 85.1495 }, // Gandhi Maidan
    { lat: 25.6062, lng: 85.1510 },
    { lat: 25.6075, lng: 85.1525 },
    { lat: 25.6088, lng: 85.1540 },
    { lat: 25.6100, lng: 85.1555 },
    { lat: 25.6115, lng: 85.1570 },
    { lat: 25.6128, lng: 85.1585 }, // Patna Junction (End)
];

// Route B: Boring Road to Kankarbagh via Rajendra Nagar
const ROUTE_B: { lat: number; lng: number }[] = [
    { lat: 25.6100, lng: 85.1200 }, // Boring Road (Start)
    { lat: 25.6085, lng: 85.1220 },
    { lat: 25.6070, lng: 85.1240 },
    { lat: 25.6055, lng: 85.1260 }, // Kidwaipuri
    { lat: 25.6040, lng: 85.1280 },
    { lat: 25.6025, lng: 85.1300 },
    { lat: 25.6010, lng: 85.1320 }, // Rajendra Nagar
    { lat: 25.5995, lng: 85.1340 },
    { lat: 25.5980, lng: 85.1360 },
    { lat: 25.5965, lng: 85.1380 },
    { lat: 25.5950, lng: 85.1400 }, // New Patliputra Colony
    { lat: 25.5935, lng: 85.1420 },
    { lat: 25.5920, lng: 85.1440 },
    { lat: 25.5905, lng: 85.1460 },
    { lat: 25.5890, lng: 85.1480 },
    { lat: 25.5875, lng: 85.1500 }, // Kankarbagh (End)
];

// Route C: Patna University to AIIMS via Ashok Rajpath
const ROUTE_C: { lat: number; lng: number }[] = [
    { lat: 25.6189, lng: 85.0950 }, // Patna University (Start)
    { lat: 25.6175, lng: 85.0980 },
    { lat: 25.6160, lng: 85.1010 },
    { lat: 25.6145, lng: 85.1040 }, // Ganga Ghat
    { lat: 25.6130, lng: 85.1070 },
    { lat: 25.6115, lng: 85.1100 },
    { lat: 25.6100, lng: 85.1130 }, // Dak Bungalow
    { lat: 25.6085, lng: 85.1160 },
    { lat: 25.6070, lng: 85.1190 },
    { lat: 25.6055, lng: 85.1220 }, // Mithapur
    { lat: 25.6040, lng: 85.1250 },
    { lat: 25.6025, lng: 85.1280 },
    { lat: 25.6010, lng: 85.1310 },
    { lat: 25.5995, lng: 85.1340 },
    { lat: 25.5980, lng: 85.1370 }, // AIIMS Patna (End)
];

// Simulated buses
const buses: SimulatedBus[] = [
    {
        id: 1,
        deviceId: 1,
        name: 'Bus 101 - Bailey Road',
        route: ROUTE_A,
        currentIndex: 0,
        speed: 25,
        direction: 1,
    },
    {
        id: 2,
        deviceId: 2,
        name: 'Bus 102 - Boring Road',
        route: ROUTE_B,
        currentIndex: 5,
        speed: 30,
        direction: 1,
    },
    {
        id: 3,
        deviceId: 3,
        name: 'Bus 103 - University',
        route: ROUTE_C,
        currentIndex: 8,
        speed: 28,
        direction: -1,
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
        console.log(`📍 Simulated ${positions.length} bus positions (Bihar/Patna)`);
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

    console.log('🚌 Starting bus simulator (Bihar/Patna region)...');
    console.log(`   Simulating ${buses.length} buses`);
    console.log(`   Routes: Bailey Road, Boring Road, University`);
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

/**
 * Get default map center for Bihar/Patna region
 */
export function getMapCenter(): { lat: number; lng: number } {
    return { lat: 25.6000, lng: 85.1350 }; // Central Patna
}
