import { Router } from 'express';

const router = Router();

// GET /api/stops - Get all stops
router.get('/', async (req, res) => {
    try {
        const { routeId } = req.query;
        // TODO: Implement with Prisma, filter by routeId if provided
        res.json([
            { id: 1, name: 'Green Park', order: 1, latitude: 28.5672, longitude: 77.2100, routeId: 1 },
            { id: 2, name: 'Lajpat Nagar', order: 2, latitude: 28.5710, longitude: 77.2340, routeId: 1 },
        ]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stops' });
    }
});

// GET /api/stops/:id - Get single stop
router.get('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({
            id: 1,
            name: 'Green Park',
            order: 1,
            latitude: 28.5672,
            longitude: 77.2100,
            address: 'Near Green Park Metro Station',
            routeId: 1,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stop' });
    }
});

// POST /api/stops - Create stop
router.post('/', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.status(201).json({ id: 1, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create stop' });
    }
});

// PUT /api/stops/:id - Update stop
router.put('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({ id: req.params.id, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update stop' });
    }
});

// DELETE /api/stops/:id - Delete stop
router.delete('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete stop' });
    }
});

export default router;
