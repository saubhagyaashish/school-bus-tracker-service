/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../services/auth.service';
import { Role } from '../generated/prisma';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: AccessTokenPayload;
        }
    }
}

/**
 * Authenticate request using Bearer token
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }

    req.user = payload;
    next();
}

/**
 * Require specific roles
 */
export function requireRole(...roles: Role[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }

        next();
    };
}

/**
 * Require user to belong to specific school (or be SUPER_ADMIN)
 */
export function requireSchool(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }

    // Super admin can access all schools
    if (req.user.role === 'SUPER_ADMIN') {
        next();
        return;
    }

    // Get schoolId from params or query
    const schoolId = parseInt(req.params.schoolId || req.query.schoolId as string);

    if (schoolId && req.user.schoolId !== schoolId) {
        res.status(403).json({ error: 'Cannot access resources from other schools' });
        return;
    }

    next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = verifyAccessToken(token);
        if (payload) {
            req.user = payload;
        }
    }

    next();
}

/**
 * Check if user can access a specific bus
 * SUPER_ADMIN: all buses
 * SCHOOL_ADMIN: school's buses
 * DRIVER: assigned buses
 * PARENT: child's bus
 */
export async function requireBusAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }

    const busId = parseInt(req.params.busId);
    if (!busId) {
        next();
        return;
    }

    // Super admin can access all
    if (req.user.role === 'SUPER_ADMIN') {
        next();
        return;
    }

    // Import prisma here to avoid circular dependency
    const { prisma } = await import('../db');

    const bus = await prisma.bus.findUnique({
        where: { id: busId },
        select: { schoolId: true, driverId: true },
    });

    if (!bus) {
        res.status(404).json({ error: 'Bus not found' });
        return;
    }

    // School admin: can access school's buses
    if (req.user.role === 'SCHOOL_ADMIN') {
        if (bus.schoolId !== req.user.schoolId) {
            res.status(403).json({ error: 'Cannot access buses from other schools' });
            return;
        }
        next();
        return;
    }

    // Driver: can access assigned buses
    if (req.user.role === 'DRIVER') {
        if (bus.driverId !== req.user.userId) {
            res.status(403).json({ error: 'Not assigned to this bus' });
            return;
        }
        next();
        return;
    }

    // Parent: can access child's bus
    if (req.user.role === 'PARENT') {
        const hasChild = await prisma.student.findFirst({
            where: {
                parentId: req.user.userId,
                busId: busId,
            },
        });

        if (!hasChild) {
            res.status(403).json({ error: 'No child assigned to this bus' });
            return;
        }
        next();
        return;
    }

    res.status(403).json({ error: 'Access denied' });
}
