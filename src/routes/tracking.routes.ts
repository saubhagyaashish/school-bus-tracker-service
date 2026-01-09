import { Router } from 'express';
import { prisma } from '../db';
import { traccarService } from '../services/traccar.service';
import { calculateEtaOSRM, calculateMultiStopEta, Stop } from '../services/eta.service';

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

        // Get stop coordinates from database
        const stop = await prisma.stop.findUnique({
            where: { id: stopId },
            include: {
                route: {
                    include: {
                        stops: {
                            orderBy: { stopOrder: 'asc' },
                        },
                    },
                },
            },
        });

        if (!stop) {
            return res.status(404).json({ error: 'Stop not found' });
        }

        // Get all stops on the route up to and including the target stop
        const routeStops = stop.route.stops
            .filter(s => s.stopOrder <= stop.stopOrder)
            .map(s => ({
                id: s.id,
                name: s.name,
                lat: s.latitude,
                lng: s.longitude,
            }));

        // Calculate multi-stop ETA using OSRM
        const multiStopResult = await calculateMultiStopEta(
            position.latitude,
            position.longitude,
            routeStops,
            stopId
        );

        // Also get direct ETA for comparison
        const directEta = await calculateEtaOSRM(
            position.latitude,
            position.longitude,
            stop.latitude,
            stop.longitude,
            true // include geometry
        );

        res.json({
            busId,
            stopId,
            stopName: stop.name,
            currentPosition: {
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                heading: position.course,
            },
            eta: {
                minutes: multiStopResult.targetStopEta?.etaMinutes ?? directEta.minutes,
                distance: multiStopResult.targetStopEta?.distance ?? directEta.distance,
                estimatedArrival: directEta.estimatedArrival,
                confidenceRange: directEta.confidenceRange,
                source: multiStopResult.source,
            },
            route: {
                geometry: multiStopResult.routeGeometry || directEta.routeGeometry,
                stopsAway: multiStopResult.stopsAway,
                totalStops: routeStops.length,
            },
        });
    } catch (error) {
        console.error('Error calculating ETA:', error);
        res.status(500).json({ error: 'Failed to calculate ETA' });
    }
});

// GET /api/tracking/bus/:busId/route-eta - Get ETA to all stops on route
router.get('/bus/:busId/route-eta', async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);

        // Get bus with assigned route
        const bus = await prisma.bus.findFirst({
            where: { traccarDeviceId: busId },
            include: {
                routes: {
                    where: { isActive: true },
                    include: {
                        stops: {
                            orderBy: { stopOrder: 'asc' },
                        },
                    },
                    take: 1,
                },
            },
        });

        if (!bus) {
            return res.status(404).json({ error: 'Bus not found' });
        }

        const route = bus.routes[0];
        if (!route) {
            return res.status(404).json({ error: 'No active route assigned to bus' });
        }

        // Get current bus position from Traccar
        const position = await traccarService.getDevicePosition(busId);

        if (!position) {
            return res.status(404).json({ error: 'Bus position not found' });
        }

        // Convert stops to ETA format
        const stops: Stop[] = route.stops.map(s => ({
            id: s.id,
            name: s.name,
            lat: s.latitude,
            lng: s.longitude,
        }));

        // Calculate multi-stop ETA
        const result = await calculateMultiStopEta(
            position.latitude,
            position.longitude,
            stops
        );

        res.json({
            busId,
            routeId: route.id,
            routeName: route.name,
            totalStops: stops.length,
            currentPosition: {
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                heading: position.course,
            },
            totalMinutes: result.totalMinutes,
            totalDistance: result.totalDistance,
            stops: result.stops,
            routeGeometry: result.routeGeometry,
            source: result.source,
        });
    } catch (error) {
        console.error('Error calculating route ETA:', error);
        res.status(500).json({ error: 'Failed to calculate route ETA' });
    }
});

// GET /api/tracking/bus/:busId/status - Get bus status
router.get('/bus/:busId/status', async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const device = await traccarService.getDevice(busId);
        const position = await traccarService.getDevicePosition(busId);

        // Get next stop for this bus
        let nextStop = null;
        const bus = await prisma.bus.findFirst({
            where: { traccarDeviceId: busId },
            include: {
                routes: {
                    where: { isActive: true },
                    include: {
                        stops: {
                            orderBy: { stopOrder: 'asc' },
                            take: 1,
                        },
                    },
                    take: 1,
                },
            },
        });

        if (bus?.routes[0]?.stops[0]) {
            nextStop = {
                id: bus.routes[0].stops[0].id,
                name: bus.routes[0].stops[0].name,
            };
        }

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
            nextStop,
        });
    } catch (error) {
        console.error('Error fetching bus status:', error);
        res.status(500).json({ error: 'Failed to fetch bus status' });
    }
});

export default router;
