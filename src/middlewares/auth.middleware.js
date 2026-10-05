const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const jwtConfig = require("../config/jwt");

async function authenticate(req, res, next) {
    const authorization = req.get("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
        return res.status(401).json({
            message: "Cần gửi JWT theo dạng Bearer token.",
        });
    }

    let payload;

    try {
        payload = jwt.verify(match[1], jwtConfig.secret, {
            algorithms: ["HS256"],
        });
    } catch (error) {
        return res.status(401).json({
            message:
                error.name === "TokenExpiredError"
                    ? "Token đã hết hạn. Hãy đăng nhập lại."
                    : "Token không hợp lệ.",
        });
    }

    if (
        typeof payload !== "object" ||
        typeof payload.sub !== "string" ||
        !/^[1-9]\d*$/.test(payload.sub) ||
        !Number.isInteger(payload.exp)
    ) {
        return res.status(401).json({
            message: "Token không hợp lệ.",
        });
    }

    const uid = Number(payload.sub);

    if (!Number.isSafeInteger(uid) || uid > 2147483647) {
        return res.status(401).json({
            message: "Token không hợp lệ.",
        });
    }

    const user = await prisma.user.findUnique({
        where: { uid },
        select: {
            uid: true,
            username: true,
            fullname: true,
            role: {
                select: { rolename: true },
            },
            membership: {
                select: { mname: true },
            },
        },
    });

    if (!user) {
        return res.status(401).json({
            message: "Tài khoản không còn tồn tại.",
        });
    }

    req.user = user;
    next();
}

function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Bạn chưa được xác thực.",
            });
        }

        if (!allowedRoles.includes(req.user.role.rolename)) {
            return res.status(403).json({
                message: "Bạn không có quyền thực hiện thao tác này.",
            });
        }

        next();
    };
}

module.exports = { authenticate, authorize };