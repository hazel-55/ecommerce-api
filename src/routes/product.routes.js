const express = require("express");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const {
    authenticate,
    authorize,
} = require("../middlewares/auth.middleware");

const router = express.Router();

// Kiểm tra pid và chuyển thành số.
router.param("pid", (req, res, next, value) => {
    const pid = Number(value);

    if (
        !/^[1-9]\d*$/.test(value) ||
        !Number.isInteger(pid) ||
        pid > 2147483647
    ) {
        return res.status(400).json({
            message: "Mã sản phẩm phải là số nguyên dương hợp lệ.",
        });
    }

    req.productId = pid;
    next();
});

// Kiểm tra dữ liệu thêm/sửa sản phẩm.
function validateProduct(partial = false) {
    return (req, res, next) => {
        const body = req.body;

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return res.status(400).json({
                message: "Dữ liệu sản phẩm phải là một đối tượng JSON.",
            });
        }

        const allowedFields = ["pname", "price", "quantity"];
        const keys = Object.keys(body);

        if (
            keys.length === 0 ||
            keys.some((key) => !allowedFields.includes(key))
        ) {
            return res.status(400).json({
                message: "Chỉ chấp nhận các trường pname, price, quantity.",
            });
        }

        const data = {};

        if (!partial || Object.hasOwn(body, "pname")) {
            if (
                typeof body.pname !== "string" ||
                body.pname.trim().length < 1 ||
                body.pname.trim().length > 100
            ) {
                return res.status(400).json({
                    message: "Tên sản phẩm phải có 1–100 ký tự.",
                });
            }

            data.pname = body.pname.trim();
        }

        if (!partial || Object.hasOwn(body, "price")) {
            if (
                typeof body.price !== "string" ||
                !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(body.price)
            ) {
                return res.status(400).json({
                    message:
                        "Giá phải là chuỗi số từ 0 đến 99999999.99, tối đa 2 chữ số thập phân.",
                });
            }

            data.price = new Prisma.Decimal(body.price);
        }

        if (!partial || Object.hasOwn(body, "quantity")) {
            if (
                !Number.isInteger(body.quantity) ||
                body.quantity < 0 ||
                body.quantity > 2147483647
            ) {
                return res.status(400).json({
                    message: "Số lượng phải là số nguyên từ 0 đến 2147483647.",
                });
            }

            data.quantity = body.quantity;
        }

        req.productData = data;
        next();
    };
}

// Xem danh sách sản phẩm.
router.get("/", async (req, res) => {
    const products = await prisma.product.findMany({
        orderBy: { pid: "asc" },
    });

    res.status(200).json({ products });
});

// Xem chi tiết sản phẩm.
router.get("/:pid", async (req, res) => {
    const product = await prisma.product.findUnique({
        where: { pid: req.productId },
    });

    if (!product) {
        return res.status(404).json({
            message: "Không tìm thấy sản phẩm.",
        });
    }

    res.status(200).json({ product });
});

// Thêm sản phẩm.
router.post(
    "/",
    authenticate,
    authorize("Admin"),
    validateProduct(),
    async (req, res) => {
        const product = await prisma.product.create({
            data: req.productData,
        });

        res.location(`/api/products/${product.pid}`);

        res.status(201).json({
            message: "Thêm sản phẩm thành công.",
            product,
        });
    }
);

// Sửa một hoặc nhiều thông tin.
router.patch(
    "/:pid",
    authenticate,
    authorize("Admin"),
    validateProduct(true),
    async (req, res) => {
        try {
            const product = await prisma.product.update({
                where: { pid: req.productId },
                data: req.productData,
            });

            return res.status(200).json({
                message: "Cập nhật sản phẩm thành công.",
                product,
            });
        } catch (error) {
            if (error.code === "P2025") {
                return res.status(404).json({
                    message: "Không tìm thấy sản phẩm.",
                });
            }

            throw error;
        }
    }
);

// Xóa sản phẩm chưa được tham chiếu trong đơn hàng.
router.delete(
    "/:pid",
    authenticate,
    authorize("Admin"),
    async (req, res) => {
        try {
            await prisma.product.delete({
                where: { pid: req.productId },
            });

            return res.status(204).end();
        } catch (error) {
            if (error.code === "P2025") {
                return res.status(404).json({
                    message: "Không tìm thấy sản phẩm.",
                });
            }

            if (error.code === "P2003") {
                return res.status(409).json({
                    message: "Không thể xóa sản phẩm đã có trong đơn hàng.",
                });
            }

            throw error;
        }
    }
);

module.exports = router;