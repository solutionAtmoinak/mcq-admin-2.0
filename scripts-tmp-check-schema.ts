import "dotenv/config";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "./app/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMssql({
    server: process.env.DATABASE_HOST!,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  }),
});

async function main() {
  const types = await prisma.questionType.findMany({
    select: { Code: true, Name: true, PresentationSchema: true, AnswerSchema: true },
  });
  console.log(JSON.stringify(types, null, 2));
}
main().finally(() => prisma.$disconnect());
