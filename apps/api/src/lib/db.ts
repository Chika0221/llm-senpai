import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../generated/prisma/client.js';

const libsql = createClient({
  url: process.env.DATABASE_URL || 'file:./dev.db',
});

const adapter = new PrismaLibSql(libsql);

export const db = new PrismaClient({ adapter });
