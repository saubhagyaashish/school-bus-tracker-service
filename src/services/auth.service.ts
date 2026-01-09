/**
 * Authentication Service
 * Handles password hashing, JWT tokens, and user authentication
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { Role } from '../generated/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ACCESS_EXPIRY = '15m';
const JWT_REFRESH_EXPIRY = '7d';
const SALT_ROUNDS = 12;

// Types
export interface AccessTokenPayload {
    userId: number;
    email: string;
    role: Role;
    schoolId: number | null;
}

export interface RefreshTokenPayload {
    userId: number;
    type: 'refresh';
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export interface LoginResult {
    user: {
        id: number;
        email: string;
        name: string;
        role: Role;
        schoolId: number | null;
        isFirstLogin: boolean;
    };
    tokens: AuthTokens;
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Generate access token
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });
}

/**
 * Generate refresh token and store in database
 */
export async function generateRefreshToken(userId: number): Promise<string> {
    const payload: RefreshTokenPayload = { userId, type: 'refresh' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });

    // Store in database
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await prisma.refreshToken.create({
        data: {
            token,
            userId,
            expiresAt,
        },
    });

    return token;
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
        const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
        return payload;
    } catch {
        return null;
    }
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token: string): Promise<number | null> {
    try {
        const payload = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;

        if (payload.type !== 'refresh') {
            return null;
        }

        // Check if token exists in database
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token },
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            return null;
        }

        return payload.userId;
    } catch {
        return null;
    }
}

/**
 * Revoke refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
        where: { token },
    });
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: number): Promise<void> {
    await prisma.refreshToken.deleteMany({
        where: { userId },
    });
}

/**
 * Login user
 */
export async function loginUser(email: string, password: string): Promise<LoginResult | null> {
    // Find user
    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user || !user.isActive) {
        return null;
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
        return null;
    }

    // Check if approved (for parents)
    if (user.role === 'PARENT' && !user.isApproved) {
        throw new Error('Account pending approval');
    }

    // Generate tokens
    const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
    });

    const refreshToken = await generateRefreshToken(user.id);

    return {
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            schoolId: user.schoolId,
            isFirstLogin: user.isFirstLogin,
        },
        tokens: {
            accessToken,
            refreshToken,
        },
    };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    const userId = await verifyRefreshToken(refreshToken);
    if (!userId) {
        return null;
    }

    // Get user
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user || !user.isActive) {
        return null;
    }

    // Generate new access token
    const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
    });

    // Rotate refresh token
    await revokeRefreshToken(refreshToken);
    const newRefreshToken = await generateRefreshToken(userId);

    return {
        accessToken,
        refreshToken: newRefreshToken,
    };
}

/**
 * Change password
 */
export async function changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user) {
        return false;
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
        return false;
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user
    await prisma.user.update({
        where: { id: userId },
        data: {
            passwordHash,
            isFirstLogin: false,
        },
    });

    // Revoke all tokens (force re-login)
    await revokeAllUserTokens(userId);

    return true;
}

/**
 * Create user (for admin use)
 */
export async function createUser(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: Role;
    schoolId?: number;
}): Promise<{ id: number; email: string }> {
    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
        data: {
            email: data.email,
            passwordHash,
            name: data.name,
            phone: data.phone,
            role: data.role,
            schoolId: data.schoolId,
            isApproved: data.role !== 'PARENT', // Parents need approval
            isFirstLogin: true,
        },
    });

    return { id: user.id, email: user.email };
}

/**
 * Clean up expired refresh tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
        where: {
            expiresAt: { lt: new Date() },
        },
    });

    return result.count;
}
