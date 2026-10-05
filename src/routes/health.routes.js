const express = require("express");
const prisma = require("../config/prisma");

const router = express.Router();

router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
        await prisma.$queryRaw`SELECT 1`;

        return res.status(200).json({
            status: "healthy",
            database: "connected",
        });
    } catch {
        return res.status(503).json({
            status: "unhealthy",
            database: "unavailable",
        });
    }
});

module.exports = router;