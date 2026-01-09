/**
 * Seed script to create initial Super Admin
 * Run: npx ts-node prisma/seed.ts
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL not set');
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const email = 'superadmin@bustracker.com';
    const password = 'SuperAdmin@123'; // Change this in production!

    // Check if already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('Super Admin already exists:', email);
        return;
    }

    // Create Super Admin
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
        data: {
            email,
            passwordHash,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
            isApproved: true,
            isFirstLogin: true, // Force password change on first login
        },
    });

    console.log('✅ Super Admin created!');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   (Please change password after first login)');
    console.log('');
    console.log('User ID:', admin.id);

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
