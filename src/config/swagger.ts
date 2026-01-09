/**
 * Swagger Configuration
 * OpenAPI 3.0 documentation for School Bus Tracker API
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'School Bus Tracker API',
            version: '1.0.0',
            description: `
# School Bus Tracker API Documentation

Real-time school bus tracking system with role-based access control.

## Roles
- **SUPER_ADMIN**: Platform administrator, can manage all schools
- **SCHOOL_ADMIN**: School administrator, manages buses, drivers, students
- **DRIVER**: Bus driver, marks attendance, adds stops
- **PARENT**: Student parent, tracks assigned bus

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`

Access tokens expire in 15 minutes. Use the refresh token to get a new access token.
            `,
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: 'http://localhost:3001',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT access token',
                },
            },
            schemas: {
                // Auth
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'superadmin@bustracker.com' },
                        password: { type: 'string', example: 'SuperAdmin@123' },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        user: { $ref: '#/components/schemas/User' },
                        tokens: { $ref: '#/components/schemas/Tokens' },
                        requirePasswordChange: { type: 'boolean' },
                    },
                },
                Tokens: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        role: { type: 'string', enum: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'DRIVER', 'PARENT'] },
                        schoolId: { type: 'integer', nullable: true },
                        isFirstLogin: { type: 'boolean' },
                    },
                },
                // School
                School: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        address: { type: 'string' },
                        phone: { type: 'string' },
                        code: { type: 'string', description: 'Unique code for parent registration' },
                        isActive: { type: 'boolean' },
                    },
                },
                CreateSchoolRequest: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', example: 'Delhi Public School' },
                        address: { type: 'string', example: '123 Main Road, Patna' },
                        phone: { type: 'string', example: '+91-9876543210' },
                    },
                },
                // Bus
                Bus: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        licensePlate: { type: 'string' },
                        capacity: { type: 'integer' },
                        schoolId: { type: 'integer' },
                        driverId: { type: 'integer' },
                    },
                },
                // Stop
                Stop: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                        stopOrder: { type: 'integer' },
                        routeId: { type: 'integer' },
                    },
                },
                CreateStopRequest: {
                    type: 'object',
                    required: ['name', 'latitude', 'longitude', 'stopOrder'],
                    properties: {
                        name: { type: 'string', example: 'Gandhi Maidan' },
                        latitude: { type: 'number', example: 25.6048 },
                        longitude: { type: 'number', example: 85.1495 },
                        address: { type: 'string' },
                        stopOrder: { type: 'integer', example: 3 },
                    },
                },
                // Attendance
                Attendance: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        studentId: { type: 'integer' },
                        busId: { type: 'integer' },
                        date: { type: 'string', format: 'date' },
                        boardedAt: { type: 'string', format: 'date-time' },
                        droppedAt: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['PENDING', 'BOARDED', 'DROPPED', 'ABSENT'] },
                    },
                },
                // ETA
                ETAResponse: {
                    type: 'object',
                    properties: {
                        busId: { type: 'integer' },
                        stopId: { type: 'integer' },
                        eta: {
                            type: 'object',
                            properties: {
                                minutes: { type: 'number' },
                                distance: { type: 'number' },
                                source: { type: 'string', enum: ['osrm', 'haversine'] },
                                confidenceRange: {
                                    type: 'object',
                                    properties: {
                                        minMinutes: { type: 'number' },
                                        maxMinutes: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
                // Error
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
                // Stats
                Stats: {
                    type: 'object',
                    properties: {
                        totalBuses: { type: 'integer' },
                        totalDrivers: { type: 'integer' },
                        totalParents: { type: 'integer' },
                        totalStudents: { type: 'integer' },
                        pendingApprovals: { type: 'integer' },
                    },
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Authentication endpoints' },
            { name: 'Admin', description: 'Admin management endpoints' },
            { name: 'Driver', description: 'Driver-specific endpoints' },
            { name: 'Tracking', description: 'Bus tracking and ETA' },
            { name: 'Simulator', description: 'Bus simulator for testing' },
        ],
    },
    apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
