"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const _1 = require(".");
const logger_1 = require("./logger/logger");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
app.use((0, cors_1.default)());
function mapPaymentMethod(prodamusMethod) {
    if (!prodamusMethod)
        return null;
    const methodLower = prodamusMethod.toLowerCase();
    switch (methodLower) {
        case "ac":
        case "ackz":
        case "acf":
            return client_1.PaymentMethod.CARD;
        case "sbp":
            return client_1.PaymentMethod.SBP;
        case "qw":
        case "qiwi":
            return client_1.PaymentMethod.QIWI;
        case "pc":
        case "yandex":
            return client_1.PaymentMethod.YANDEX;
        case "paypal":
            return client_1.PaymentMethod.PAYPAL;
        case "crypto":
            return client_1.PaymentMethod.CRYPTO;
        default:
            logger_1.logger.warn(`Неизвестный payment_method из Продамуса: ${prodamusMethod}`);
            return null;
    }
}
const verifySignature = (data, secretKey, signature) => {
    try {
        const hmac = crypto_1.default.createHmac("sha256", secretKey);
        hmac.update(JSON.stringify(data));
        const computedSignature = hmac.digest("hex");
        return computedSignature === signature;
    }
    catch (error) {
        logger_1.logger.error("❌ Ошибка генерации HMAC:", error);
        return false;
    }
};
app.post("/webhook/payment", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const secretKey = config_1.config.secretKey;
        const signatureHeader = req.headers["sign"] || req.headers["Sign"];
        if (!signatureHeader ||
            !verifySignature(req.body, secretKey, signatureHeader)) {
            logger_1.logger.warn("⚠️ Ошибка верификации подписи запроса.");
            res.status(400).send("Invalid signature");
            return;
        }
        const { order_id, amount, status, user_id, payment_method } = req.body;
        if (!order_id || !amount || !status || !user_id) {
            logger_1.logger.warn("⚠️ Некорректные данные в запросе (отсутствуют ключевые поля).");
            res.status(400).send("Invalid request data");
            return;
        }
        if (typeof user_id !== "string" || !/^\d+$/.test(user_id)) {
            logger_1.logger.warn(`⚠️ user_id не является корректным числом: ${user_id}`);
            res.status(400).send("Invalid user_id");
            return;
        }
        const userId = BigInt(user_id);
        const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
        if (isNaN(parsedAmount)) {
            logger_1.logger.error(`❌ Ошибка конвертации amount: ${amount}`);
            res.status(400).send("Invalid amount format");
            return;
        }
        const user = yield _1.prisma.telegramUser.findUnique({ where: { userId } });
        if (!user) {
            logger_1.logger.warn(`⚠️ Пользователь не найден: ${userId}`);
            res.status(404).send("User not found");
            return;
        }
        const paymentMethodEnum = mapPaymentMethod(payment_method);
        try {
            yield _1.prisma.payment.upsert({
                where: { orderId: order_id },
                update: {
                    status: status.toUpperCase(),
                    paymentMethod: paymentMethodEnum,
                },
                create: {
                    userId,
                    orderId: order_id,
                    amount: parsedAmount,
                    status: status.toUpperCase(),
                    paymentMethod: paymentMethodEnum,
                },
            });
            logger_1.logger.info(`✅ Оплата ${order_id} обновлена: ${status}`);
        }
        catch (dbError) {
            logger_1.logger.error("❌ Ошибка записи в БД:", dbError);
            res.status(500).send("Database error");
            return;
        }
        try {
            if (status === "success") {
                yield _1.bot.telegram.sendMessage(user.userId.toString(), `✅ Оплата на сумму ${parsedAmount} RUB успешно прошла!\n\nСсылка на опросник...`);
                logger_1.logger.info(`📩 Уведомление об успешной оплате отправлено пользователю ${userId}`);
            }
            else if (status === "pending") {
                yield _1.bot.telegram.sendMessage(user.userId.toString(), `⌛ Ваша оплата на сумму ${parsedAmount} RUB обрабатывается. Пожалуйста, дождитесь подтверждения!`);
                logger_1.logger.info(`📩 Уведомление о PENDING отправлено пользователю ${userId}`);
            }
            else {
                yield _1.bot.telegram.sendMessage(user.userId.toString(), `❌ Ошибка оплаты. Попробуйте снова.`);
                logger_1.logger.warn(`📩 Уведомление об ошибке оплаты отправлено пользователю ${userId}`);
            }
        }
        catch (tgError) {
            logger_1.logger.error(`❌ Ошибка отправки сообщения пользователю ${userId}:`, tgError);
        }
        res.sendStatus(200);
    }
    catch (error) {
        logger_1.logger.error("❌ Ошибка обработки вебхука:", error);
        res.sendStatus(500);
    }
}));
app.listen(config_1.config.port, () => {
    logger_1.logger.info(`🚀 Webhook сервер запущен на порту ${config_1.config.port}`);
});
