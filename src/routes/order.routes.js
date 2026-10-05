const express = require("express");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const {
    authenticate,
    authorize,
} = require("../middlewares/auth.middleware");

const router = express.Router();

function businessError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function validateOrder(req, res, next) {
    const body = req.body;

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some((key) => key !== "items") ||
        !Array.isArray(body.items) ||
        body.items.length < 1 ||
        body.items.length > 50
    ) {
        return res.status(400).json({
            message: "Chỉ gửi items, gồm từ 1 đến 50 sản phẩm.",
        });
    }

    const seen = new Set();

    for (const item of body.items) {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            Object.keys(item).some((key) => !["pid", "qty"].includes(key)) ||
            !Number.isInteger(item.pid) ||
            item.pid < 1 ||
            item.pid > 2147483647 ||
            !Number.isInteger(item.qty) ||
            item.qty < 1 ||
            item.qty > 2147483647
        ) {
            return res.status(400).json({
                message: "Mỗi sản phẩm cần pid và qty là số nguyên dương hợp lệ.",
            });
        }

        if (seen.has(item.pid)) {
            return res.status(400).json({
                message: "Không được gửi trùng pid trong một đơn hàng.",
            });
        }

        seen.add(item.pid);
    }

    // Cập nhật sản phẩm theo cùng thứ tự để giảm nguy cơ deadlock.
    req.orderItems = [...body.items].sort((a, b) => a.pid - b.pid);
    next();
}

async function createOrder(uid, items) {
    return prisma.$transaction(
        async (tx) => {
            const products = await tx.product.findMany({
                where: {
                    pid: { in: items.map((item) => item.pid) },
                },
            });

            const productMap = new Map(
                products.map((product) => [product.pid, product])
            );

            const details = [];

            for (const item of items) {
                const product = productMap.get(item.pid);

                if (!product) {
                    throw businessError(
                        404,
                        `Không tìm thấy sản phẩm ${item.pid}.`
                    );
                }

                // Chỉ trừ tồn kho nếu số lượng hiện tại đủ.
                const updated = await tx.product.updateMany({
                    where: {
                        pid: item.pid,
                        quantity: { gte: item.qty },
                    },
                    data: {
                        quantity: { decrement: item.qty },
                    },
                });

                if (updated.count !== 1) {
                    throw businessError(
                        409,
                        `Sản phẩm ${item.pid} không đủ tồn kho.`
                    );
                }

                details.push({
                    pid: item.pid,
                    qty: item.qty,
                    unit_price: product.price,
                });
            }

            return tx.order.create({
                data: {
                    uid,
                    details: {
                        create: details,
                    },
                },
                include: {
                    details: {
                        include: {
                            product: {
                                select: { pname: true },
                            },
                        },
                        orderBy: { pid: "asc" },
                    },
                },
            });
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
        }
    );
}

// Thử lại tối đa 3 lần nếu transaction bị xung đột.
async function createOrderWithRetry(uid, items) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await createOrder(uid, items);
        } catch (error) {
            if (error.code === "P2034" && attempt < 2) {
                continue;
            }

            throw error;
        }
    }
}

router.post(
    "/",
    authenticate,
    authorize("Customer"),
    validateOrder,
    async (req, res) => {
        try {
            const order = await createOrderWithRetry(
                req.user.uid,
                req.orderItems
            );

            const total = order.details.reduce(
                (sum, detail) =>
                    sum.plus(detail.unit_price.times(detail.qty)),
                new Prisma.Decimal(0)
            );

            res.location(`/api/orders/${order.oid}`);

            return res.status(201).json({
                message: "Đặt hàng thành công.",
                order: {
                    ...order,
                    total: total.toFixed(2),
                },
            });
        } catch (error) {
            if (error.status === 404 || error.status === 409) {
                return res.status(error.status).json({
                    message: error.message,
                });
            }

            if (error.code === "P2034") {
                return res.status(409).json({
                    message: "Có xung đột cập nhật tồn kho. Hãy thử đặt hàng lại.",
                });
            }

            throw error;
        }
    }
);

// Kiểm tra mã đơn hàng trên URL.
router.param("oid", (req, res, next, value) => {
    const oid = Number(value);

    if (
        !/^[1-9]\d*$/.test(value) ||
        !Number.isInteger(oid) ||
        oid > 2147483647
    ) {
        return res.status(400).json({
            message: "Mã đơn hàng phải là số nguyên dương hợp lệ.",
        });
    }

    req.orderId = oid;
    next();
});

// Các thông tin đi kèm khi đọc đơn hàng.
const orderInclude = {
    details: {
        include: {
            product: {
                select: { pname: true },
            },
        },
        orderBy: { pid: "asc" },
    },
    shipments: {
        orderBy: { shipid: "asc" },
    },
};

// Tổng tiền luôn lấy từ giá đã lưu trong chi tiết đơn.
function withTotal(order) {
    const total = order.details.reduce(
        (sum, detail) =>
            sum.plus(detail.unit_price.times(detail.qty)),
        new Prisma.Decimal(0)
    );

    return {
        ...order,
        total: total.toFixed(2),
    };
}

// Xem danh sách theo quyền.
router.get(
    "/",
    authenticate,
    authorize("Customer", "Admin"),
    async (req, res) => {
        const where =
            req.user.role.rolename === "Admin"
                ? {}
                : { uid: req.user.uid };

        const orders = await prisma.order.findMany({
            where,
            include: orderInclude,
            orderBy: { oid: "desc" },
        });

        res.status(200).json({
            orders: orders.map(withTotal),
        });
    }
);

// Xem chi tiết theo quyền.
router.get(
    "/:oid",
    authenticate,
    authorize("Customer", "Admin"),
    async (req, res) => {
        const where = {
            oid: req.orderId,
        };

        if (req.user.role.rolename !== "Admin") {
            where.uid = req.user.uid;
        }

        const order = await prisma.order.findFirst({
            where,
            include: orderInclude,
        });

        if (!order) {
            return res.status(404).json({
                message: "Không tìm thấy đơn hàng.",
            });
        }

        res.status(200).json({
            order: withTotal(order),
        });
    }
);
module.exports = router;