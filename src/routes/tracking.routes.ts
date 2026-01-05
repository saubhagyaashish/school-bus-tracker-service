import { Router } from 'express';
import { traccarService } from '../services/traccar.service';
import { calculateEta } from '../services/eta.service';

const router = Router();

// GET /api/tracking/positions - Get all bus positions
router.get('/positions', async (req, res) => {
    try {
        const positions = await traccarService.getPositions();
        res.json(positions);
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: 'Failed to fetch positions' });
    }
});

// GET /api/tracking/bus/:busId/eta/:stopId - Get ETA to specific stop
router.get('/bus/:busId/eta/:stopId', async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const stopId = parseInt(req.params.stopId);

        // Get current bus position from Traccar
        const position = await traccarService.getDevicePosition(busId);

        if (!position) {
            return res.status(404).json({ error: 'Bus position not found' });
        }

        // TODO: Get stop coordinates from database
        const stopLat = 28.5672; // Placeholder
        const stopLng = 77.2100;

        // Calculate ETA
        const eta = calculateEta(
            position.latitude,
            position.longitude,
            stopLat,
            stopLng,
            position.speed
        );

        res.json({
            busId,
            stopId,
            currentPosition: {
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                heading: position.course,
            },
            eta: {
                minutes: eta.minutes,
                distance: eta.distance,
                estimatedArrival: eta.estimatedArrival,
            },
        });
    } catch (error) {
        console.error('Error calculating ETA:', error);
        res.status(500).json({ error: 'Failed to calculate ETA' });
    }
});

// GET /api/tracking/bus/:busId/status - Get bus status
router.get('/bus/:busId/status', async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const device = await traccarService.getDevice(busId);
        const position = await traccarService.getDevicePosition(busId);

        res.json({
            busId,
            name: device?.name,
            status: device?.status || 'unknown',
            lastUpdate: device?.lastUpdate,
            position: position ? {
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                heading: position.course,
                address: position.address,
            } : null,
        });
    } catch (error) {
        console.error('Error fetching bus status:', error);
        res.status(500).json({ error: 'Failed to fetch bus status' });
    }
});

export default router;
