const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const jwtConfig = require("../config/jwt");

const router = express.Router();
const { authenticate } = require("../middlewares/auth.middleware");
// Chọn những trường được phép trả về cho người dùng.
const publicUserSelect = {
    uid: true,
    username: true,
    fullname: true,
    role: {
        select: { rolename: true },
    },
    membership: {
        select: { mname: true },
    },
};

// Đăng ký: luôn tạo tài khoản Customer, hạng Basic.
router.post("/register", async (req, res) => {
    const { username, fullname, password } = req.body ?? {};

    if (
        typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username)
    ) {
        return res.status(400).json({
            message:
                "Username phải có 3–50 ký tự, gồm chữ không dấu, số hoặc dấu gạch dưới.",
        });
    }

    if (
        typeof fullname !== "string" ||
        fullname.trim().length < 1 ||
        fullname.trim().length > 100
    ) {
        return res.status(400).json({
            message: "Fullname phải có 1–100 ký tự sau khi bỏ khoảng trắng đầu cuối.",
        });
    }

    if (
        typeof password !== "string" ||
        password.length < 12 ||
        bcrypt.truncates(password)
    ) {
        return res.status(400).json({
            message: "Mật khẩu phải có ít nhất 12 ký tự và không quá 72 byte.",
        });
    }

    const [role, membership] = await Promise.all([
        prisma.role.findUnique({
            where: { rolename: "Customer" },
        }),
        prisma.memberShip.findUnique({
            where: { mname: "Basic" },
        }),
    ]);

    if (!role || !membership) {
        return res.status(503).json({
            message: "Chưa có dữ liệu nền. Hãy chạy seed.",
        });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const user = await prisma.user.create({
            data: {
                username,
                fullname: fullname.trim(),
                password: passwordHash,
                roleid: role.roleid,
                mid: membership.mid,
            },
            select: publicUserSelect,
        });

        return res.status(201).json({
            message: "Đăng ký thành công",
            user,
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                message: "Username đã tồn tại.",
            });
        }

        throw error;
    }
});

// Đăng nhập và phát hành JWT.
router.post("/login", async (req, res) => {
    const { username, password } = req.body ?? {};

    if (
        typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,50}$/.test(username) ||
        typeof password !== "string" ||
        password.length < 1 ||
        bcrypt.truncates(password)
    ) {
        return res.status(400).json({
            message: "Thông tin đăng nhập không hợp lệ.",
        });
    }

    const user = await prisma.user.findUnique({
        where: { username },
        select: {
            ...publicUserSelect,
            password: true,
        },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({
            message: "Username hoặc mật khẩu không đúng.",
        });
    }

    const accessToken = jwt.sign({}, jwtConfig.secret, {
        algorithm: "HS256",
        subject: String(user.uid),
        expiresIn: jwtConfig.expiresIn,
    });

    const { password: passwordHash, ...publicUser } = user;

    return res.status(200).json({
        message: "Đăng nhập thành công",
        accessToken,
        tokenType: "Bearer",
        expiresIn: jwtConfig.expiresIn,
        user: publicUser,
    });
});
router.get("/me", authenticate, (req, res) => {
    res.status(200).json({
        user: req.user,
    });
});
module.exports = router;