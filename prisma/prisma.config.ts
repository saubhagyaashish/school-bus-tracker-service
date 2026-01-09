import { defineConfig } from 'prisma/config'

export default defineConfig({
    earlyAccess: true,
    schema: './prisma/schema.prisma',

    migrate: {
        async resolveConnection() {
            return {
                url: process.env.DATABASE_URL!,
            }
        },
    },
})
