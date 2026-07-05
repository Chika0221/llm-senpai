import { DATABASE_URL } from '../env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from "@prisma/adapter-pg" ;

const adapter = new PrismaPg({
    connectionString: DATABASE_URL
});

export const db = new PrismaClient({ adapter });

