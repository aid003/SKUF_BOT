import { Telegraf, Markup } from "telegraf";
import { escapeMarkdownV2 } from "../helpers/escapeMarkdownV2";
import { logger } from "../logger/logger";
import { safeExecute } from "../helpers/safeExecute";
import { prisma } from "..";
import { config } from "../config";
import { PaymentStatus } from "@prisma/client";
// Импортируем node-fetch (или другую библиотеку), если в вашей версии Node.js нет глобального fetch
import fetch from "node-fetch";

// Если нужно — функция для HMAC-подписи (если в вашем Продамусе обязательна подпись).
import crypto from "crypto";

export function setupStartCommand(bot: Telegraf) {
  bot.start(async (ctx) => {
    await safeExecute(ctx, async () => {
      if (!ctx.from) {
        logger.warn("ctx.from отсутствует при выполнении /start");
        return;
      }

      const userData = {
        userId: BigInt(ctx.from.id),
        isBot: ctx.from.is_bot,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name || null,
        username: ctx.from.username || null,
        languageCode: ctx.from.language_code || null,
        isPremium: ctx.from.is_premium ?? false,
        addedToAttachmentMenu: ctx.from.added_to_attachment_menu ?? false,
      };

      try {
        const existingUser = await prisma.telegramUser.findUnique({
          where: { userId: userData.userId },
        });

        if (!existingUser) {
          await prisma.telegramUser.create({ data: userData });
          logger.info(
            `Новый пользователь: ID=${ctx.from.id} (${ctx.from.username}).`
          );
        } else {
          await prisma.telegramUser.update({
            where: { userId: userData.userId },
            data: {
              isBot: userData.isBot,
              firstName: userData.firstName,
              lastName: userData.lastName,
              username: userData.username,
              languageCode: userData.languageCode,
              isPremium: userData.isPremium,
              addedToAttachmentMenu: userData.addedToAttachmentMenu,
            },
          });
          logger.info(
            `Пользователь повторно запустил /start: ID=${ctx.from.id} (${ctx.from.username}).`
          );
        }
      } catch (dbError: any) {
        logger.error("Ошибка при работе с БД:", dbError);
        await ctx.reply("Произошла ошибка при регистрации. Попробуйте позже!");
        return;
      }

      const safeFirstName = escapeMarkdownV2(ctx.from.first_name || "Гость");
      const message =
        `*${safeFirstName}*, на связи *Скуфы маркетинга*👋\n\n` +
        `_Благодарю тебя за подписку, теперь ты не пропустишь самое важное\\!_\n\n` +
        `Этот бот создан для оповещения о наших мероприятиях и активностях, которые помогают селлерам выходить на новый уровень\\.\n\n` +
        `Подобные мероприятия обычно проходят не чаще 2х раз в месяц\\.\n\n` +
        `Для оплаты участия в мероприятии, перейдите по кнопке *"Оплатить"*\\.\n\n` +
        `Если тебе интересно узнать о ближайшем мероприятии, нажмите на кнопку *"Прислать анонс ближайшей программы"*`;

      try {
        await ctx.reply(message, {
          parse_mode: "MarkdownV2",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("💳 Оплатить", "pay")],
            [
              Markup.button.callback(
                "📢 Прислать анонс ближайшей программы",
                "send_announcement"
              ),
            ],
          ]),
        });
      } catch (tgError: any) {
        logger.error("Ошибка при отправке приветственного сообщения:", tgError);
      }
    });
  });

  /**
   * При клике на "Оплатить":
   * 1) Генерируем уникальный orderId
   * 2) Делаем запрос POST к Продамусу с do=link, чтобы вернулся короткий URL
   * 3) Сохраняем платёж в БД (статус PENDING)
   * 4) Отправляем пользователю короткую ссылку
   */
  bot.action("pay", async (ctx) => {
    await safeExecute(ctx, async () => {
      if (!ctx.from) {
        logger.warn("Нажата кнопка 'pay', но ctx.from отсутствует.");
        return;
      }

      const userId = BigInt(ctx.from.id);
      const orderId = `order_${userId}_${Date.now()}`;
      const price = config.amount ? Number(config.amount) : 2000;

      // Подготовим данные для Продамуса.
      // В зависимости от требований вам могут понадобиться:
      // - products (массив товаров),
      // - order_id, user_id,
      // - do=link,
      // - type=json,
      // - callbackType=json,
      // - возможно, signature (HMAC).
      const prodamusPayload: any = {
        do: "link",
        type: "json", // чтобы ответ пришел в JSON
        // callbackType: "json",  // иногда нужно и это
        order_id: orderId, // вам нужно сопоставлять в вебхуке
        products: [
          {
            name: "Оплата мероприятия",
            price: price,
            quantity: 1,
          },
        ],
        // user_id: userId, // если нужно в форме
        // ... другие поля (phone, email) по желанию
      };

      // --- Опционально: подпись HMAC, если включена в Продамусе
      if (process.env.PRODAMUS_SECRET_KEY) {
        // Пример простейшей генерации подписи
        const secret = process.env.PRODAMUS_SECRET_KEY;
        const sortedKeys = Object.keys(prodamusPayload).sort();
        const dataString = sortedKeys
          .map((k) => `${k}=${JSON.stringify(prodamusPayload[k])}`)
          .join("&");

        const hmac = crypto.createHmac("sha256", secret!);
        hmac.update(dataString);
        const signature = hmac.digest("hex");

        prodamusPayload.signature = signature;
      }

      // Отправляем запрос POST на config.paymentUrl
      // Примерно так:
      let paymentLink: string | undefined = undefined;
      try {
        const response = await fetch(config.paymentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(prodamusPayload),
        });

        if (!response.ok) {
          const textBody = await response.text();
          throw new Error(
            `Запрос к Продамусу не успешен: ${response.status} / ${textBody}`
          );
        }

        const data = await response.json();
        // Предположим, что Продамус вернёт что-то вроде { "link": "https://payform.ru/nj6H3Oq/" }
        if (!data.link) {
          throw new Error("В ответе отсутствует поле link");
        }

        paymentLink = data.link;
      } catch (err) {
        logger.error(
          "❌ Ошибка при получении короткой ссылки от Продамуса:",
          err
        );
        // Можно уведомить пользователя
        await ctx.reply(
          "Произошла ошибка при генерации ссылки на оплату. Попробуйте позже."
        );
        return;
      }

      // Создаём запись о платеже в БД
      try {
        await prisma.payment.create({
          data: {
            userId,
            orderId,
            amount: price,
            status: PaymentStatus.PENDING,
            paymentMethod: null,
          },
        });
        logger.info(`Создана запись о платеже ${orderId} (PENDING)`);
      } catch (dbError: any) {
        logger.error("❌ Ошибка при создании записи в БД:", dbError);
        // Сообщаем об ошибке, если нужно
      }

      // Отправляем пользователю ссылку
      // Если внутри Telegram откроется пустой экран — он может скопировать ссылку
      if (paymentLink) {
        const msg =
          `💳 *Оплата мероприятия*\n\n` +
          `Короткая ссылка на оплату: [${paymentLink}](${paymentLink})\n\n` +
          `Если внутри Telegram ссылка открывается пустой страницей, скопируйте её и вставьте в браузере.`;

        try {
          await ctx.reply(msg, {
            parse_mode: "MarkdownV2",
            ...Markup.inlineKeyboard([
              [Markup.button.url("💳 Оплатить", paymentLink)],
            ]),
          });
          logger.info(
            `Короткая ссылка ${paymentLink} отправлена пользователю ${userId}`
          );
        } catch (tgError: any) {
          logger.error("❌ Ошибка при отправке ссылки на оплату:", tgError);
        }
      }

      try {
        await ctx.answerCbQuery();
      } catch (tgError: any) {
        logger.warn("⚠️ Ошибка при answerCbQuery:", tgError);
      }
    });
  });

  bot.action("send_announcement", async (ctx) => {
    await safeExecute(ctx, async () => {
      if (!ctx.from) {
        logger.warn(
          "Нажата кнопка 'send_announcement', но ctx.from отсутствует."
        );
        return;
      }

      try {
        const response = await fetch(`${config.strapiUrl}/announcements`);
        if (!response.ok) throw new Error(`Ошибка API: ${response.statusText}`);

        const data = await response.json();

        if (!data || !data.data || !Array.isArray(data.data)) {
          throw new Error("Некорректный формат ответа от Strapi");
        }

        interface Announcement {
          title: string;
          date: Date;
          content?: string;
        }

        const announcements: Announcement[] = data.data
          .map((item: { title?: string; date?: string; content?: string }) => {
            if (!item.title || !item.date) {
              logger.warn("Некорректный объект анонса:", JSON.stringify(item));
              return null;
            }
            return {
              title: item.title,
              date: new Date(item.date),
              content: item.content?.trim() || null,
            };
          })
          .filter((a: Announcement): a is Announcement => a !== null)
          .sort(
            (a: Announcement, b: Announcement) =>
              a.date.getTime() - b.date.getTime()
          );

        if (announcements.length === 0) {
          await ctx.reply("❌ Нет доступных мероприятий.", {
            parse_mode: "MarkdownV2",
          });
          return;
        }

        const nextEvent = announcements[0];
        const otherEvents = announcements.slice(1);

        const formatDateTime = (date: Date): string =>
          date.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });

        const escapeMD = (text: string): string => {
          return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
        };

        let message =
          `📅 *Ближайшее мероприятие*\n\n` +
          `👉 *Тема:* ${escapeMD(nextEvent.title)}\n` +
          `⏱️ *Дата:* ${escapeMD(formatDateTime(nextEvent.date))}\n`;

        if (nextEvent.content) {
          message += `📢 ${escapeMD(nextEvent.content)}\n`;
        }

        if (otherEvents.length > 0) {
          message += `\n\n💼 *Другие мероприятия*\n`;
          otherEvents.forEach((event) => {
            message +=
              `\n👉 *Тема:* ${escapeMD(event.title)}\n` +
              `⏱️ *Дата:* ${escapeMD(formatDateTime(event.date))}\n`;
            if (event.content) {
              message += `📢 ${escapeMD(event.content)}\n`;
            }
          });
        }

        await ctx.reply(message, { parse_mode: "MarkdownV2" });
      } catch (error: any) {
        logger.error("Ошибка при получении анонсов:", error);
        await ctx.reply("❌ Не удалось загрузить мероприятия.", {
          parse_mode: "MarkdownV2",
        });
      }

      try {
        await ctx.answerCbQuery();
      } catch (tgError: any) {
        logger.warn("Ошибка при answerCbQuery:", tgError);
      }
    });
  });
}
