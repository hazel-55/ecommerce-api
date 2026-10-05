const healthRoutes = require("./routes/health.routes");
const shipmentRoutes = require("./routes/shipment.routes");
const orderRoutes = require("./routes/order.routes");
const {
    authenticate,
    authorize,
} = require("./middlewares/auth.middleware");
const express = require("express");
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");

const app = express();
const portText = process.env.PORT;

if (!portText || !/^\d+$/.test(portText)) {
    console.error("PORT trong .env phải là số nguyên.");
    process.exit(1);
}

const PORT = Number(portText);

if (PORT < 1 || PORT > 65535) {
    console.error("PORT phải nằm trong khoảng 1 đến 65535.");
    process.exit(1);
}

app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
    res.status(200).json({
        message: "E-commerce API đang hoạt động",
    });
});
app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipments", shipmentRoutes);
app.get(
    "/api/admin/check",
    authenticate,
    authorize("Admin"),
    (req, res) => {
        res.status(200).json({
            message: "Bạn có quyền Admin.",
            user: req.user,
        });
    }
);
app.use((req, res) => {
    res.status(404).json({
        message: "API không tồn tại.",
    });
});

// Middleware xử lý lỗi phải nằm sau các routes.
app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            message: "JSON không hợp lệ.",
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            message: "Dữ liệu gửi lên quá lớn.",
        });
    }

    console.error("Lỗi xử lý API:", error.code || error.name);

    return res.status(500).json({
        message: "Lỗi hệ thống.",
    });
});

app.listen(PORT, () => {
    console.log(`API đang chạy tại http://localhost:${PORT}`);
});