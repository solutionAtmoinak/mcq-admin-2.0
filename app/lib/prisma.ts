import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@/app/generated/prisma/client";

function getMssqlConfig() {
  return {
    server: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaMssql(getMssqlConfig()),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
