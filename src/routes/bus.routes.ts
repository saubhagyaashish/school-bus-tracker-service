import { Router } from 'express';
import { traccarService } from '../services/traccar.service';

const router = Router();

// GET /api/buses - Get all buses
router.get('/', async (req, res) => {
    try {
        // TODO: Filter by school from JWT
        const devices = await traccarService.getDevices();
        res.json(devices);
    } catch (error) {
        console.error('Error fetching buses:', error);
        res.status(500).json({ error: 'Failed to fetch buses' });
    }
});

// GET /api/buses/:id - Get single bus
router.get('/:id', async (req, res) => {
    try {
        const deviceId = parseInt(req.params.id);
        const device = await traccarService.getDevice(deviceId);

        if (!device) {
            return res.status(404).json({ error: 'Bus not found' });
        }

        res.json(device);
    } catch (error) {
        console.error('Error fetching bus:', error);
        res.status(500).json({ error: 'Failed to fetch bus' });
    }
});

// GET /api/buses/:id/position - Get current position of a bus
router.get('/:id/position', async (req, res) => {
    try {
        const deviceId = parseInt(req.params.id);
        const position = await traccarService.getDevicePosition(deviceId);

        if (!position) {
            return res.status(404).json({ error: 'Position not found' });
        }

        res.json(position);
    } catch (error) {
        console.error('Error fetching position:', error);
        res.status(500).json({ error: 'Failed to fetch position' });
    }
});

// GET /api/buses/:id/history - Get position history
router.get('/:id/history', async (req, res) => {
    try {
        const deviceId = parseInt(req.params.id);
        const from = new Date(req.query.from as string || Date.now() - 24 * 60 * 60 * 1000);
        const to = new Date(req.query.to as string || Date.now());

        const history = await traccarService.getPositionHistory(deviceId, from, to);
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default router;
