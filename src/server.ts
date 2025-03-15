import express, { Request, Response, Application } from "express";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import crypto from "crypto";
import cors from "cors";
import { config } from "./config";
import { bot, prisma } from ".";
import { logger } from "./logger/logger";

const app: Application = express();

// Используем express.raw(), чтобы получить оригинальное тело запроса
app.use(express.raw({ type: "*/*" }));
app.use(cors());

/**
 * 🔹 Функция маппинга методов оплаты из Продамус в наше перечисление
 */
function mapPaymentMethod(
  prodamusMethod: string | undefined
): PaymentMethod | null {
  if (!prodamusMethod) return null;
  const methodLower = prodamusMethod.toLowerCase();

  switch (methodLower) {
    case "ac":
    case "ackz":
    case "acf":
      return PaymentMethod.CARD;
    case "sbp":
      return PaymentMethod.SBP;
    case "qw":
    case "qiwi":
      return PaymentMethod.QIWI;
    case "pc":
    case "yandex":
      return PaymentMethod.YANDEX;
    case "paypal":
      return PaymentMethod.PAYPAL;
    case "crypto":
      return PaymentMethod.CRYPTO;
    default:
      logger.warn(
        `⚠️ Неизвестный payment_method из Продамуса: ${prodamusMethod}`
      );
      return null;
  }
}

/**
 * 🔹 Функция проверки подписи HMAC
 */
const verifySignature = (
  rawBody: string,
  secretKey: string,
  signature: string
): boolean => {
  try {
    const hmac = crypto.createHmac("sha256", secretKey);
    hmac.update(rawBody, "utf8"); // Используем оригинальное тело запроса
    const computedSignature = hmac.digest("hex");

    if (computedSignature !== signature) {
      logger.warn(`⚠️ Подписи не совпадают! 
      Ожидалось: ${signature} 
      Получено: ${computedSignature}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("❌ Ошибка генерации HMAC:", error);
    return false;
  }
};

/**
 * 🔹 Обработка webhook оплаты от Продамус
 */
app.post(
  "/webhook/payment",
  async (req: Request<{}, {}, any>, res: Response): Promise<void> => {
    try {
      const secretKey = config.secretKey!;
      const signatureHeader =
        (req.headers["sign"] as string) || (req.headers["Sign"] as string);

      if (
        !signatureHeader ||
        !verifySignature(req.body.toString("utf8"), secretKey, signatureHeader)
      ) {
        logger.warn("⚠️ Ошибка верификации подписи запроса.");
        res.status(400).send("Invalid signature");
        return;
      }

      const rawBody = req.body.toString("utf8"); // Получаем оригинальное тело запроса
      logger.info("📩 Получены данные вебхука (RAW):", rawBody);

      const data = JSON.parse(rawBody);
      const { order_id, amount, status, user_id, payment_method } = data;

      if (!order_id || !amount || !status || !user_id) {
        logger.warn(
          "⚠️ Некорректные данные в запросе (отсутствуют ключевые поля)."
        );
        res.status(400).send("Invalid request data");
        return;
      }

      if (typeof user_id !== "string" || !/^\d+$/.test(user_id)) {
        logger.warn(`⚠️ user_id не является корректным числом: ${user_id}`);
        res.status(400).send("Invalid user_id");
        return;
      }

      const userId = BigInt(user_id);
      const parsedAmount = parseFloat(amount);

      if (isNaN(parsedAmount)) {
        logger.error(`❌ Ошибка конвертации amount: ${amount}`);
        res.status(400).send("Invalid amount format");
        return;
      }

      const user = await prisma.telegramUser.findUnique({ where: { userId } });
      if (!user) {
        logger.warn(`⚠️ Пользователь не найден: ${userId}`);
        res.status(404).send("User not found");
        return;
      }

      const paymentMethodEnum = mapPaymentMethod(payment_method);

      try {
        await prisma.payment.upsert({
          where: { orderId: order_id },
          update: {
            status: status.toUpperCase() as PaymentStatus,
            paymentMethod: paymentMethodEnum,
          },
          create: {
            userId,
            orderId: order_id,
            amount: parsedAmount,
            status: status.toUpperCase() as PaymentStatus,
            paymentMethod: paymentMethodEnum,
          },
        });

        logger.info(`✅ Оплата ${order_id} обновлена: ${status}`);
      } catch (dbError) {
        logger.error("❌ Ошибка записи в БД:", dbError);
        res.status(500).send("Database error");
        return;
      }

      try {
        if (status === "success") {
          await bot.telegram.sendMessage(
            user.userId.toString(),
            `✅ Оплата на сумму ${parsedAmount} RUB успешно прошла!\n\nСсылка на опросник...`
          );
          logger.info(
            `📩 Уведомление об успешной оплате отправлено пользователю ${userId}`
          );
        } else if (status === "pending") {
          await bot.telegram.sendMessage(
            user.userId.toString(),
            `⌛ Ваша оплата на сумму ${parsedAmount} RUB обрабатывается. Пожалуйста, дождитесь подтверждения!`
          );
          logger.info(
            `📩 Уведомление о PENDING отправлено пользователю ${userId}`
          );
        } else {
          await bot.telegram.sendMessage(
            user.userId.toString(),
            `❌ Ошибка оплаты. Попробуйте снова.`
          );
          logger.warn(
            `📩 Уведомление об ошибке оплаты отправлено пользователю ${userId}`
          );
        }
      } catch (tgError) {
        logger.error(
          `❌ Ошибка отправки сообщения пользователю ${userId}:`,
          tgError
        );
      }

      res.sendStatus(200);
    } catch (error) {
      logger.error("❌ Ошибка обработки вебхука:", error);
      res.sendStatus(500);
    }
  }
);

/**
 * 🔹 Запуск сервера
 */
app.listen(config.port, () => {
  logger.info(`🚀 Webhook сервер запущен на порту ${config.port}`);
});
