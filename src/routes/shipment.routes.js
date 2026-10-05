const express = require("express");
const prisma = require("../config/prisma");
const {
    authenticate,
    authorize,
} = require("../middlewares/auth.middleware");

const router = express.Router();

router.param("shipid", (req, res, next, value) => {
    const shipid = Number(value);

    if (
        !/^[1-9]\d*$/.test(value) ||
        !Number.isInteger(shipid) ||
        shipid > 2147483647
    ) {
        return res.status(400).json({
            message: "Mã giao hàng phải là số nguyên dương hợp lệ.",
        });
    }

    req.shipmentId = shipid;
    next();
});

// Admin tạo giao hàng với trạng thái ban đầu PENDING.
router.post(
    "/",
    authenticate,
    authorize("Admin"),
    async (req, res) => {
        const body = req.body;

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "oid") ||
            !Number.isInteger(body.oid) ||
            body.oid < 1 ||
            body.oid > 2147483647
        ) {
            return res.status(400).json({
                message: "Chỉ gửi oid là mã đơn hàng nguyên dương hợp lệ.",
            });
        }

        try {
            const shipment = await prisma.shipment.create({
                data: {
                    oid: body.oid,
                    status: "PENDING",
                },
            });

            res.location(`/api/shipments/${shipment.shipid}`);

            return res.status(201).json({
                message: "Tạo giao hàng thành công.",
                shipment,
            });
        } catch (error) {
            if (error.code === "P2003") {
                return res.status(404).json({
                    message: "Không tìm thấy đơn hàng.",
                });
            }

            throw error;
        }
    }
);

// Xem giao hàng theo quyền và chủ sở hữu đơn.
router.get(
    "/:shipid",
    authenticate,
    authorize("Customer", "Admin"),
    async (req, res) => {
        const where = {
            shipid: req.shipmentId,
        };

        if (req.user.role.rolename !== "Admin") {
            where.order = {
                uid: req.user.uid,
            };
        }

        const shipment = await prisma.shipment.findFirst({
            where,
        });

        if (!shipment) {
            return res.status(404).json({
                message: "Không tìm thấy giao hàng.",
            });
        }

        res.status(200).json({ shipment });
    }
);

// Admin cập nhật theo luồng trạng thái.
router.patch(
    "/:shipid",
    authenticate,
    authorize("Admin"),
    async (req, res) => {
        const body = req.body;
        const allowedStatuses = ["PENDING", "SHIPPING", "DELIVERED"];

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "status") ||
            !allowedStatuses.includes(body.status)
        ) {
            return res.status(400).json({
                message: "Chỉ gửi status: PENDING, SHIPPING hoặc DELIVERED.",
            });
        }

        const shipment = await prisma.shipment.findUnique({
            where: { shipid: req.shipmentId },
        });

        if (!shipment) {
            return res.status(404).json({
                message: "Không tìm thấy giao hàng.",
            });
        }

        const nextStatus = {
            PENDING: "SHIPPING",
            SHIPPING: "DELIVERED",
        };

        if (body.status !== nextStatus[shipment.status]) {
            return res.status(409).json({
                message: "Chỉ cập nhật theo luồng PENDING → SHIPPING → DELIVERED.",
            });
        }

        const updatedShipment = await prisma.$transaction(async (tx) => {
            const updated = await tx.shipment.updateMany({
                where: {
                    shipid: shipment.shipid,
                    status: shipment.status,
                },
                data: {
                    status: body.status,
                },
            });

            if (updated.count !== 1) {
                return null;
            }

            return tx.shipment.findUnique({
                where: { shipid: shipment.shipid },
            });
        });

        if (!updatedShipment) {
            return res.status(409).json({
                message: "Trạng thái đã được thay đổi. Hãy tải lại thông tin.",
            });
        }

        res.status(200).json({
            message: "Cập nhật giao hàng thành công.",
            shipment: updatedShipment,
        });
    }
);

module.exports = router;