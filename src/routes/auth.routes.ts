import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schemas
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(10),
    password: z.string().min(6),
    schoolId: z.number(),
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        // TODO: Implement actual authentication with database
        // For now, return mock response
        res.json({
            success: true,
            user: {
                id: 1,
                name: 'Test Parent',
                email,
                role: 'parent',
            },
            token: 'mock-jwt-token',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.issues });
        }
        res.status(500).json({ error: 'Login failed' });
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const data = registerSchema.parse(req.body);

        // TODO: Implement actual registration with database
        res.json({
            success: true,
            message: 'Registration successful',
            user: {
                id: 1,
                name: data.name,
                email: data.email,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.issues });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    // TODO: Implement JWT verification
    res.json({
        id: 1,
        name: 'Test Parent',
        email: 'parent@test.com',
        role: 'parent',
    });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out' });
});

export default router;
