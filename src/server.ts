import express, { Request, Response, Application } from "express";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import dotenv from "dotenv";
import cors from "cors";
import { config } from "./config";
import { bot, prisma } from ".";
import { logger } from "./logger/logger";

dotenv.config();

const app: Application = express();

// Используем express.urlencoded() для обработки application/x-www-form-urlencoded
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
 * 🔹 Функция извлечения user_id из order_num
 */
function extractUserId(orderNum: string): string | null {
  const match = orderNum.match(/^order_(\d+)_\d+$/);
  return match ? match[1] : null;
}

/**
 * 🔹 Обработка webhook оплаты от Продамус (исправлено извлечение user_id)
 */
app.post(
  "/webhook/payment",
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info("📩 Получены данные вебхука:", req.body);

      const { order_id, order_num, sum, payment_status, payment_type } =
        req.body;

      // Если user_id отсутствует в вебхуке, извлекаем его из order_num
      let userId = extractUserId(order_num);

      if (!order_id || !sum || !payment_status || !userId) {
        logger.warn(
          "⚠️ Некорректные данные в запросе (отсутствуют ключевые поля)."
        );
        res.status(400).send("Invalid request data");
        return;
      }

      const parsedAmount = parseFloat(sum);

      if (isNaN(parsedAmount)) {
        logger.error(`❌ Ошибка конвертации sum: ${sum}`);
        res.status(400).send("Invalid sum format");
        return;
      }

      // Приводим user_id к BigInt
      const userIdBigInt = BigInt(userId);

      const user = await prisma.telegramUser.findUnique({
        where: { userId: userIdBigInt },
      });
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
            userId: userIdBigInt,
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
