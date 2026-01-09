import { Router } from 'express';
import { startBusSimulator, stopBusSimulator, getSimulatedBuses, getMapCenter } from '../services/bus-simulator';
import { osrmService } from '../services/osrm.service';
import { io } from '../index';

const router = Router();

// GET /api/simulator/status - Get simulator status
router.get('/status', (req, res) => {
    const buses = getSimulatedBuses();
    res.json({
        buses: buses.map(bus => ({
            id: bus.id,
            name: bus.name,
            currentIndex: bus.currentIndex,
            routeLength: bus.route.length,
        })),
        center: getMapCenter(),
    });
});

// GET /api/simulator/route/:busId - Get OSRM route for a simulated bus
router.get('/route/:busId', async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const buses = getSimulatedBuses();
        const bus = buses.find(b => b.id === busId);

        if (!bus) {
            return res.status(404).json({ error: 'Simulated bus not found' });
        }

        // Get route geometry from OSRM
        const waypoints = bus.route.map(point => ({
            lat: point.lat,
            lng: point.lng,
        }));

        // Use first point as origin and rest as waypoints
        const origin = waypoints[0];
        const destinations = waypoints.slice(1);

        const routeResult = await osrmService.getMultiStopRoute(origin, destinations);

        if (!routeResult) {
            return res.status(503).json({ error: 'OSRM service unavailable' });
        }

        res.json({
            busId,
            busName: bus.name,
            routeGeometry: routeResult.geometry,
            totalDistance: routeResult.totalDistance,
            totalDuration: routeResult.totalDuration,
            legs: routeResult.legs,
        });
    } catch (error) {
        console.error('Error fetching OSRM route:', error);
        res.status(500).json({ error: 'Failed to fetch route' });
    }
});

// GET /api/simulator/stops - Get simulated stops with OSRM route
router.get('/stops', async (req, res) => {
    try {
        // Hardcoded stops for Bihar/Patna region
        const stops = [
            { id: 1, name: 'Bailey Road', lat: 25.5941, lng: 85.1376, order: 1 },
            { id: 2, name: 'Patna Zoo', lat: 25.5995, lng: 85.1435, order: 2 },
            { id: 3, name: 'Gandhi Maidan', lat: 25.6048, lng: 85.1495, order: 3 },
            { id: 4, name: 'Patna Junction', lat: 25.6128, lng: 85.1585, order: 4 },
        ];

        // Get OSRM route between all stops
        const waypoints = stops.map(s => ({ lat: s.lat, lng: s.lng }));
        const origin = waypoints[0];
        const destinations = waypoints.slice(1);

        let routeGeometry: string | undefined;
        try {
            const routeResult = await osrmService.getMultiStopRoute(origin, destinations);
            routeGeometry = routeResult?.geometry;
        } catch (e) {
            console.log('OSRM unavailable for stops route');
        }

        res.json({
            stops,
            routeGeometry,
            center: getMapCenter(),
        });
    } catch (error) {
        console.error('Error fetching simulated stops:', error);
        res.status(500).json({ error: 'Failed to fetch stops' });
    }
});

// POST /api/simulator/start - Start the bus simulator
router.post('/start', (req, res) => {
    const interval = parseInt(req.query.interval as string) || 2000;

    if (!io) {
        return res.status(500).json({ error: 'Socket.IO not initialized' });
    }

    startBusSimulator(io, interval);
    res.json({
        success: true,
        message: `Bus simulator started with ${interval}ms interval`,
    });
});

// POST /api/simulator/stop - Stop the bus simulator
router.post('/stop', (req, res) => {
    stopBusSimulator();
    res.json({ success: true, message: 'Bus simulator stopped' });
});

export default router;
