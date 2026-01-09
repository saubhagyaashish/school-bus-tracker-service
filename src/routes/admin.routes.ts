/**
 * Admin Routes
 * Super Admin and School Admin endpoints
 */

import { Router } from 'express';
import { prisma } from '../db';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { createUser } from '../services/auth.service';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// ==================== SUPER ADMIN ROUTES ====================

/**
 * @swagger
 * /api/admin/schools:
 *   post:
 *     summary: Create a new school
 *     description: Create a new school (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSchoolRequest'
 *     responses:
 *       201:
 *         description: School created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/School'
 *       403:
 *         description: Not authorized (requires SUPER_ADMIN)
 */
router.post('/schools', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const { name, address, phone } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'School name required' });
        }

        const code = `SCH${Date.now().toString(36).toUpperCase()}`;

        const school = await prisma.school.create({
            data: { name, address, phone, code },
        });

        res.status(201).json(school);
    } catch (error) {
        console.error('Create school error:', error);
        res.status(500).json({ error: 'Failed to create school' });
    }
});

/**
 * @swagger
 * /api/admin/schools:
 *   get:
 *     summary: List all schools
 *     description: Get list of all schools with counts (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of schools
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/School'
 */
router.get('/schools', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const schools = await prisma.school.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { users: true, buses: true, students: true },
                },
            },
        });

        res.json(schools);
    } catch (error) {
        console.error('List schools error:', error);
        res.status(500).json({ error: 'Failed to list schools' });
    }
});

/**
 * @swagger
 * /api/admin/schools/{schoolId}/admin:
 *   post:
 *     summary: Create a school admin
 *     description: Create admin user for a school (Super Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, name, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: School admin created
 */
router.post('/schools/:schoolId/admin', requireRole('SUPER_ADMIN'), async (req, res) => {
    try {
        const schoolId = parseInt(req.params.schoolId);
        const { email, name, phone, password } = req.body;

        if (!email || !name || !password) {
            return res.status(400).json({ error: 'Email, name, and password required' });
        }

        const school = await prisma.school.findUnique({ where: { id: schoolId } });
        if (!school) {
            return res.status(404).json({ error: 'School not found' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const user = await createUser({
            email, password, name, phone,
            role: 'SCHOOL_ADMIN',
            schoolId,
        });

        res.status(201).json({
            id: user.id,
            email: user.email,
            message: 'School admin created. They must change password on first login.',
        });
    } catch (error) {
        console.error('Create school admin error:', error);
        res.status(500).json({ error: 'Failed to create school admin' });
    }
});

// ==================== SCHOOL ADMIN ROUTES ====================

/**
 * @swagger
 * /api/admin/drivers:
 *   post:
 *     summary: Add a driver
 *     description: Create driver user for school (School Admin or Super Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, name, password]
 *             properties:
 *               email:
 *                 type: string
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Driver created
 */
router.post('/drivers', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { email, name, phone, password } = req.body;
        const schoolId = req.user!.schoolId;

        if (!schoolId && req.user!.role !== 'SUPER_ADMIN') {
            return res.status(400).json({ error: 'School context required' });
        }

        if (!email || !name || !password) {
            return res.status(400).json({ error: 'Email, name, and password required' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const user = await createUser({
            email, password, name, phone,
            role: 'DRIVER',
            schoolId: schoolId!,
        });

        res.status(201).json({
            id: user.id,
            email: user.email,
            message: 'Driver created. They must change password on first login.',
        });
    } catch (error) {
        console.error('Create driver error:', error);
        res.status(500).json({ error: 'Failed to create driver' });
    }
});

/**
 * @swagger
 * /api/admin/drivers:
 *   get:
 *     summary: List drivers
 *     description: Get all drivers for school
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of drivers
 */
router.get('/drivers', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const schoolId = req.user!.schoolId;

        const drivers = await prisma.user.findMany({
            where: {
                role: 'DRIVER',
                schoolId: req.user!.role === 'SUPER_ADMIN' ? undefined : schoolId!,
            },
            select: {
                id: true, email: true, name: true, phone: true, isActive: true,
                buses: { select: { id: true, name: true } },
            },
        });

        res.json(drivers);
    } catch (error) {
        console.error('List drivers error:', error);
        res.status(500).json({ error: 'Failed to list drivers' });
    }
});

/**
 * @swagger
 * /api/admin/parents/pending:
 *   get:
 *     summary: List pending parent approvals
 *     description: Get parents waiting for approval
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending parents
 */
router.get('/parents/pending', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const schoolId = req.user!.schoolId;

        const pending = await prisma.user.findMany({
            where: {
                role: 'PARENT',
                isApproved: false,
                schoolId: req.user!.role === 'SUPER_ADMIN' ? undefined : schoolId!,
            },
            select: {
                id: true, email: true, name: true, phone: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(pending);
    } catch (error) {
        console.error('List pending parents error:', error);
        res.status(500).json({ error: 'Failed to list pending parents' });
    }
});

/**
 * @swagger
 * /api/admin/parents/{userId}/approve:
 *   post:
 *     summary: Approve a parent
 *     description: Approve parent account registration
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Parent approved
 */
router.post('/parents/:userId/approve', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const schoolId = req.user!.schoolId;

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user || user.role !== 'PARENT') {
            return res.status(404).json({ error: 'Parent not found' });
        }

        if (req.user!.role === 'SCHOOL_ADMIN' && user.schoolId !== schoolId) {
            return res.status(403).json({ error: 'Cannot approve parents from other schools' });
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isApproved: true },
        });

        res.json({ success: true, message: 'Parent approved' });
    } catch (error) {
        console.error('Approve parent error:', error);
        res.status(500).json({ error: 'Failed to approve parent' });
    }
});

/**
 * @swagger
 * /api/admin/parents/{userId}/reject:
 *   post:
 *     summary: Reject a parent
 *     description: Reject and delete parent account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Parent rejected
 */
router.post('/parents/:userId/reject', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const schoolId = req.user!.schoolId;

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user || user.role !== 'PARENT') {
            return res.status(404).json({ error: 'Parent not found' });
        }

        if (req.user!.role === 'SCHOOL_ADMIN' && user.schoolId !== schoolId) {
            return res.status(403).json({ error: 'Cannot reject parents from other schools' });
        }

        await prisma.user.delete({ where: { id: userId } });

        res.json({ success: true, message: 'Parent rejected and removed' });
    } catch (error) {
        console.error('Reject parent error:', error);
        res.status(500).json({ error: 'Failed to reject parent' });
    }
});

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Get counts for buses, drivers, parents, students
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stats'
 */
router.get('/stats', requireRole('SCHOOL_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const schoolId = req.user!.schoolId;
        const whereSchool = req.user!.role === 'SUPER_ADMIN' ? {} : { schoolId: schoolId! };

        const [totalBuses, totalDrivers, totalParents, totalStudents, pendingApprovals] = await Promise.all([
            prisma.bus.count({ where: whereSchool }),
            prisma.user.count({ where: { ...whereSchool, role: 'DRIVER' } }),
            prisma.user.count({ where: { ...whereSchool, role: 'PARENT', isApproved: true } }),
            prisma.student.count({ where: whereSchool }),
            prisma.user.count({ where: { ...whereSchool, role: 'PARENT', isApproved: false } }),
        ]);

        res.json({ totalBuses, totalDrivers, totalParents, totalStudents, pendingApprovals });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

export default router;
