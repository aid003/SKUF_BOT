import express, { Request, Response, Application } from "express";
import { PaymentStatus, PaymentMethod } from "@prisma/client";
import dotenv from "dotenv";
import cors from "cors";
import { config } from "./config";
import { bot, prisma } from ".";
import { logger } from "./logger/logger";

dotenv.config();

const app: Application = express();

app.use(express.urlencoded({ extended: true }));
app.use(cors());

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

function extractUserId(orderNum: string): string | null {
  const match = orderNum.match(/^order_(\d+)_\d+$/);
  return match ? match[1] : null;
}

app.post(
  "/webhook/payment",
  async (req: Request, res: Response): Promise<void> => {
    try {
      logger.info("📩 Получены данные вебхука:", req.body);

      const { order_id, order_num, sum, payment_status, payment_type } =
        req.body;

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

      const existingPayment = await prisma.payment.findUnique({
        where: { orderId: order_id },
      });

      if (existingPayment && existingPayment.status === "SUCCESS") {
        logger.info(
          `✅ Оплата ${order_id} уже подтверждена, сообщение не отправляется.`
        );
        res.sendStatus(200);
        return;
      }

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

      if (
        payment_status.toLowerCase() === "success" &&
        (!existingPayment || existingPayment.status !== "SUCCESS")
      ) {
        try {
          await bot.telegram.sendMessage(
            user.userId.toString(),
            `✅ Оплата на сумму ${parsedAmount} RUB успешно прошла!\n\nСсылка на опросник...`
          );
          logger.info(
            `📩 Уведомление об успешной оплате отправлено пользователю ${userId}`
          );
        } catch (tgError) {
          logger.error(
            `❌ Ошибка отправки сообщения пользователю ${userId}:`,
            tgError
          );
        }
      }

      res.sendStatus(200);
    } catch (error) {
      logger.error("❌ Ошибка обработки вебхука:", error);
      res.sendStatus(500);
    }
  }
);

app.listen(config.port, () => {
  logger.info(`🚀 Webhook сервер запущен на порту ${config.port}`);
});
