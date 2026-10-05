const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("Thiếu DATABASE_URL trong cấu hình.");
}

const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 3000,
});
const prisma = new PrismaClient({ adapter });

module.exports = prisma;