import { Router } from 'express';

const router = Router();

// GET /api/students - Get all students (for parent)
router.get('/', async (req, res) => {
    try {
        // TODO: Filter by parent from JWT
        res.json([
            {
                id: 1,
                name: 'Rahul Sharma',
                grade: 'Class 5A',
                busId: 1,
                busName: 'Bus 101',
                stopId: 1,
                stopName: 'Green Park',
            },
        ]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// GET /api/students/:id - Get single student
router.get('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({
            id: 1,
            name: 'Rahul Sharma',
            grade: 'Class 5A',
            rollNo: '5A-12',
            busId: 1,
            busName: 'Bus 101',
            stopId: 1,
            stopName: 'Green Park',
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch student' });
    }
});

// POST /api/students - Add student (parent adds child)
router.post('/', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.status(201).json({ id: 1, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add student' });
    }
});

// PUT /api/students/:id - Update student
router.put('/:id', async (req, res) => {
    try {
        // TODO: Implement with Prisma
        res.json({ id: req.params.id, ...req.body });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update student' });
    }
});

export default router;
