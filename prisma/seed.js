const bcrypt = require("bcryptjs");
const prisma = require("../src/config/prisma");

async function main() {
    const username = process.env.ADMIN_USERNAME;
    const fullname = process.env.ADMIN_FULLNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (!username || !fullname || !password) {
        throw new Error("Thiếu cấu hình tài khoản Admin trong .env.");
    }

    if (username.length > 50 || fullname.length > 100) {
        throw new Error("Username hoặc fullname vượt giới hạn của database.");
    }

    if (
        password === "replace_with_your_password" ||
        password.length < 12 ||
        bcrypt.truncates(password)
    ) {
        throw new Error(
            "Hãy đặt mật khẩu Admin riêng, ít nhất 12 ký tự và không quá 72 byte."
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.$transaction(async (tx) => {
        const adminRole = await tx.role.upsert({
            where: { rolename: "Admin" },
            update: {},
            create: { rolename: "Admin" },
        });

        await tx.role.upsert({
            where: { rolename: "Customer" },
            update: {},
            create: { rolename: "Customer" },
        });

        const membership = await tx.memberShip.upsert({
            where: { mname: "Basic" },
            update: {},
            create: {
                mname: "Basic",
                score: 0,
            },
        });

        const user = await tx.user.upsert({
            where: { username },
            update: {},
            create: {
                username,
                fullname,
                password: passwordHash,
                roleid: adminRole.roleid,
                mid: membership.mid,
            },
            select: {
                uid: true,
                username: true,
                role: { select: { rolename: true } },
                membership: { select: { mname: true } },
            },
        });

        if (user.role.rolename !== "Admin") {
            throw new Error("Username Admin đã được một tài khoản khác sử dụng.");
        }

        return user;
    });

    // Kiểm tra mật khẩu lưu trong database.
    const storedUser = await prisma.user.findUnique({
        where: { username },
        select: { password: true },
    });

    const passwordMatches = await bcrypt.compare(
        password,
        storedUser.password
    );

    console.log("Seed hoàn tất.");
    console.log("Tài khoản:", admin);
    console.log("Số vai trò:", await prisma.role.count());
    console.log("Số hạng thành viên:", await prisma.memberShip.count());
    console.log("Số người dùng:", await prisma.user.count());
    console.log(
        "Mật khẩu khớp cấu hình:",
        passwordMatches ? "Có" : "Không"
    );
}

main()
    .catch((error) => {
        console.error("Seed thất bại:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });