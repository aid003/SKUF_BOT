import { Telegraf, Markup } from "telegraf";
import { escapeMarkdownV2 } from "../helpers/escapeMarkdownV2";
import { logger } from "../logger/logger";
import { safeExecute } from "../helpers/safeExecute";
import { prisma } from "..";
import { config } from "../config";
import { PaymentStatus } from "@prisma/client";

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

  bot.action("pay", async (ctx) => {
    await safeExecute(ctx, async () => {
      if (!ctx.from) {
        logger.warn("Нажата кнопка 'pay', но ctx.from отсутствует.");
        return;
      }

      const userId = BigInt(ctx.from.id);
      const orderId = `order_${userId}_${Date.now()}`;

      // Формирование ссылки на оплату
      const paymentLink = `${config.paymentUrl}?order_id=${orderId}&user_id=${userId}&do=pay`;

      const message =
        `💳 *Оплата мероприятия*\n\n` +
        `Для оплаты перейдите по ссылке: [Оплатить](${paymentLink})`;

      try {
        await prisma.payment.create({
          data: {
            userId,
            orderId,
            amount: config.amount || 2000,
            status: PaymentStatus.PENDING,
            paymentMethod: null,
          },
        });

        await ctx.reply(message, {
          parse_mode: "MarkdownV2",
          ...Markup.inlineKeyboard([
            [Markup.button.url("💳 Оплатить", paymentLink)],
          ]),
        });

        logger.info(`📩 Ссылка на оплату отправлена пользователю ${userId}.`);
      } catch (tgError: any) {
        logger.error("❌ Ошибка при отправке ссылки на оплату:", tgError);
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
          .filter((a: Announcement | null): a is Announcement => a !== null)
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
