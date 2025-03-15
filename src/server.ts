import express, { Request, Response, Application } from "express";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import dotenv from "dotenv";
import cors from "cors";
import { config } from "./config";
import { bot, prisma } from ".";
import { logger } from "./logger/logger";

dotenv.config();

const app: Application = express();

// Используем express.urlencoded() вместо express.raw(), чтобы парсить application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
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
 * 🔹 Обработка webhook оплаты от Продамус (исправлено парсинг данных)
 */
app.post(
  "/webhook/payment",
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info("📩 Получены данные вебхука:", req.body);

      const { order_id, sum, payment_status, user_id, payment_type } = req.body;

      if (!order_id || !sum || !payment_status || !user_id) {
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
      const parsedAmount = parseFloat(sum);

      if (isNaN(parsedAmount)) {
        logger.error(`❌ Ошибка конвертации sum: ${sum}`);
        res.status(400).send("Invalid sum format");
        return;
      }

      const user = await prisma.telegramUser.findUnique({ where: { userId } });
      if (!user) {
        logger.warn(`⚠️ Пользователь не найден: ${userId}`);
        res.status(404).send("User not found");
        return;
      }

      const paymentMethodEnum = mapPaymentMethod(payment_type);

      try {
        await prisma.payment.upsert({
          where: { orderId: order_id },
          update: {
            status: payment_status.toUpperCase() as PaymentStatus,
            paymentMethod: paymentMethodEnum,
          },
          create: {
            userId,
            orderId: order_id,
            amount: parsedAmount,
            status: payment_status.toUpperCase() as PaymentStatus,
            paymentMethod: paymentMethodEnum,
          },
        });

        logger.info(`✅ Оплата ${order_id} обновлена: ${payment_status}`);
      } catch (dbError) {
        logger.error("❌ Ошибка записи в БД:", dbError);
        res.status(500).send("Database error");
        return;
      }

      try {
        if (payment_status === "success") {
          await bot.telegram.sendMessage(
            user.userId.toString(),
            `✅ Оплата на сумму ${parsedAmount} RUB успешно прошла!\n\nСсылка на опросник...`
          );
          logger.info(
            `📩 Уведомление об успешной оплате отправлено пользователю ${userId}`
          );
        } else if (payment_status === "pending") {
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
