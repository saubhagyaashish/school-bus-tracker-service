import { Router } from 'express';
import { startBusSimulator, stopBusSimulator, getSimulatedBuses } from '../services/bus-simulator';
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
    });
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
