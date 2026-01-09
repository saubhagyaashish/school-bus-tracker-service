/**
 * Driver Routes
 * Attendance marking, bus status updates, stop management
 */

import { Router } from 'express';
import { prisma } from '../db';
import { authenticate, requireRole, requireBusAccess } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/driver/buses:
 *   get:
 *     summary: Get assigned buses
 *     description: Get buses assigned to the driver with routes and students
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assigned buses
 */
router.get('/buses', requireRole('DRIVER'), async (req, res) => {
    try {
        const buses = await prisma.bus.findMany({
            where: { driverId: req.user!.userId },
            include: {
                routes: {
                    where: { isActive: true },
                    include: { stops: { orderBy: { stopOrder: 'asc' } } },
                },
                students: {
                    select: {
                        id: true, name: true, grade: true,
                        stop: { select: { id: true, name: true, stopOrder: true } },
                    },
                },
            },
        });

        res.json(buses);
    } catch (error) {
        console.error('Get driver buses error:', error);
        res.status(500).json({ error: 'Failed to get buses' });
    }
});

/**
 * @swagger
 * /api/driver/buses/{busId}/students:
 *   get:
 *     summary: Get students on bus
 *     description: Get students with today's attendance status
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: busId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of students with attendance
 */
router.get('/buses/:busId/students', requireRole('DRIVER'), requireBusAccess, async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        const students = await prisma.student.findMany({
            where: { busId },
            include: { stop: { select: { id: true, name: true, stopOrder: true } } },
            orderBy: { stop: { stopOrder: 'asc' } },
        });

        const attendance = await prisma.attendance.findMany({
            where: { busId, date },
        });

        const attendanceMap = new Map(attendance.map((a: { studentId: number }) => [a.studentId, a]));

        const result = students.map((student: { id: number }) => ({
            ...student,
            attendance: attendanceMap.get(student.id) || null,
        }));

        res.json(result);
    } catch (error) {
        console.error('Get bus students error:', error);
        res.status(500).json({ error: 'Failed to get students' });
    }
});

/**
 * @swagger
 * /api/driver/buses/{busId}/attendance/{studentId}/board:
 *   post:
 *     summary: Mark student as boarded
 *     description: Mark that student has boarded the bus
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: busId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attendance marked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 */
router.post('/buses/:busId/attendance/:studentId/board', requireRole('DRIVER'), requireBusAccess, async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const studentId = parseInt(req.params.studentId);
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        const student = await prisma.student.findFirst({ where: { id: studentId, busId } });
        if (!student) {
            return res.status(404).json({ error: 'Student not found on this bus' });
        }

        const attendance = await prisma.attendance.upsert({
            where: { studentId_busId_date: { studentId, busId, date } },
            update: { boardedAt: new Date(), status: 'BOARDED' },
            create: { studentId, busId, date, boardedAt: new Date(), status: 'BOARDED' },
        });

        res.json(attendance);
    } catch (error) {
        console.error('Mark boarded error:', error);
        res.status(500).json({ error: 'Failed to mark student as boarded' });
    }
});

/**
 * @swagger
 * /api/driver/buses/{busId}/attendance/{studentId}/drop:
 *   post:
 *     summary: Mark student as dropped
 *     description: Mark that student has been dropped off
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: busId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attendance updated
 */
router.post('/buses/:busId/attendance/:studentId/drop', requireRole('DRIVER'), requireBusAccess, async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const studentId = parseInt(req.params.studentId);
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        const attendance = await prisma.attendance.update({
            where: { studentId_busId_date: { studentId, busId, date } },
            data: { droppedAt: new Date(), status: 'DROPPED' },
        });

        res.json(attendance);
    } catch (error) {
        console.error('Mark dropped error:', error);
        res.status(500).json({ error: 'Failed to mark student as dropped' });
    }
});

/**
 * @swagger
 * /api/driver/buses/{busId}/attendance/{studentId}/absent:
 *   post:
 *     summary: Mark student as absent
 *     description: Mark that student is absent today
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: busId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Attendance marked
 */
router.post('/buses/:busId/attendance/:studentId/absent', requireRole('DRIVER'), requireBusAccess, async (req, res) => {
    try {
        const busId = parseInt(req.params.busId);
        const studentId = parseInt(req.params.studentId);
        const date = new Date();
        date.setHours(0, 0, 0, 0);

        const attendance = await prisma.attendance.upsert({
            where: { studentId_busId_date: { studentId, busId, date } },
            update: { status: 'ABSENT' },
            create: { studentId, busId, date, status: 'ABSENT' },
        });

        res.json(attendance);
    } catch (error) {
        console.error('Mark absent error:', error);
        res.status(500).json({ error: 'Failed to mark student as absent' });
    }
});

/**
 * @swagger
 * /api/driver/routes/{routeId}/stops:
 *   post:
 *     summary: Add a stop to route
 *     description: Add a new stop to a route (Driver or School Admin)
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateStopRequest'
 *     responses:
 *       201:
 *         description: Stop created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stop'
 */
router.post('/routes/:routeId/stops', requireRole('DRIVER', 'SCHOOL_ADMIN'), async (req, res) => {
    try {
        const routeId = parseInt(req.params.routeId);
        const { name, latitude, longitude, address, stopOrder } = req.body;

        if (!name || !latitude || !longitude || !stopOrder) {
            return res.status(400).json({ error: 'Name, latitude, longitude, and stopOrder required' });
        }

        const route = await prisma.route.findUnique({
            where: { id: routeId },
            include: { bus: true },
        });

        if (!route) {
            return res.status(404).json({ error: 'Route not found' });
        }

        if (req.user!.role === 'DRIVER' && route.bus?.driverId !== req.user!.userId) {
            return res.status(403).json({ error: 'Not assigned to this route' });
        }

        if (req.user!.role === 'SCHOOL_ADMIN' && route.schoolId !== req.user!.schoolId) {
            return res.status(403).json({ error: 'Cannot modify routes from other schools' });
        }

        const stop = await prisma.stop.create({
            data: { name, latitude, longitude, address, routeId, stopOrder },
        });

        res.status(201).json(stop);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Stop order already exists for this route' });
        }
        console.error('Add stop error:', error);
        res.status(500).json({ error: 'Failed to add stop' });
    }
});

export default router;
