import { Router } from 'express';

const router = Router();

// GET /api/routes - Get all routes
router.get('/', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json([
            {
                id: 1,
                name: 'Morning Route A',
                type: 'MORNING',
                busId: 1,
                stopsCount: 5,
                isActive: true,
            },
        ]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch routes' });
    }
});

// GET /api/routes/:id - Get single route with stops
router.get('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({
            id: 1,
            name: 'Morning Route A',
            type: 'MORNING',
            busId: 1,
            isActive: true,
            stops: [
                { id: 1, name: 'Green Park', order: 1, lat: 28.5672, lng: 77.2100 },
                { id: 2, name: 'Lajpat Nagar', order: 2, lat: 28.5710, lng: 77.2340 },
                { id: 3, name: 'School Gate', order: 3, lat: 28.5800, lng: 77.2500 },
            ],
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch route' });
    }
});

// POST /api/routes - Create route
router.post('/', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.status(201).json({ id: 1, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create route' });
    }
});

// PUT /api/routes/:id - Update route
router.put('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({ id: req.params.id, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update route' });
    }
});

// DELETE /api/routes/:id - Delete route
router.delete('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete route' });
    }
});

export default router;
