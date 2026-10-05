const secret = process.env.JWT_SECRET;
const expiresText = process.env.JWT_EXPIRES_SECONDS;

if (
    !secret ||
    secret === "replace_with_a_random_secret" ||
    Buffer.byteLength(secret, "utf8") < 32
) {
    throw new Error("JWT_SECRET phải là khóa riêng, ít nhất 32 byte.");
}

if (!expiresText || !/^\d+$/.test(expiresText)) {
    throw new Error("JWT_EXPIRES_SECONDS phải là số nguyên dương.");
}

const expiresIn = Number(expiresText);

if (!Number.isSafeInteger(expiresIn) || expiresIn < 1) {
    throw new Error("JWT_EXPIRES_SECONDS không hợp lệ.");
}

module.exports = { secret, expiresIn };