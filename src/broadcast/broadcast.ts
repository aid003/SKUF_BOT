import { Telegraf, Markup } from "telegraf";
import { logger } from "../logger/logger";
import { prisma } from "..";
import { config } from "../config";

// Тип креатива
interface Creative {
  type: "photo" | "video" | "text" | "sticker" | "voice" | "video_note";
  fileId?: string; // для фото, видео, стикера, голосового или кружочка
  caption?: string; // подпись для фото или видео
  text?: string; // текст для текстового сообщения
}

// Хранение загруженного креатива для каждого админа (key = adminId)
const pendingCreatives: Record<number, Creative | null> = {};

/**
 * Проверяем, является ли пользователь администратором (role = 'admin').
 * Если пользователь не найден или role != 'admin', вернём false.
 */
async function isUserAdmin(userId: number): Promise<boolean> {
  const user = await prisma.telegramUser.findUnique({
    where: { userId: BigInt(userId) },
  });
  return user?.role === "admin";
}

/**
 * Получаем список userId из БД по заданной роли.
 * Сортируем по убыванию createdAt (сначала самые новые).
 * Ограничиваем результат `limit`.
 * Возвращаем массив обычных чисел (из BigInt).
 */
async function getUserIdsByRole(
  role: string,
  limit: number
): Promise<number[]> {
  const users = await prisma.telegramUser.findMany({
    where: { role },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { userId: true },
  });
  return users.map((u) => Number(u.userId));
}

/**
 * Разбивает массив на чанки (по умолчанию размер чанка = 30),
 * чтобы не превысить rate-limit Telegram (≈30 сообщений/сек).
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Разбиваем слишком длинный текст (>4096) на несколько частей,
 * каждая <= 4096 символов, чтобы Telegram не выдал ошибку.
 */
function splitTextIntoMessages(text: string, maxLength = 4096): string[] {
  const parts: string[] = [];
  let currentIndex = 0;
  while (currentIndex < text.length) {
    parts.push(text.slice(currentIndex, currentIndex + maxLength));
    currentIndex += maxLength;
  }
  return parts;
}

export function setupBroadcast(bot: Telegraf) {
  //
  // ===== Обработчики медиа и текстов от админов =====
  //
  bot.on("photo", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.photo) return;

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    pendingCreatives[ctx.from.id] = {
      type: "photo",
      fileId,
      caption: ctx.message.caption || "",
    };

    await ctx.reply(
      "Креатив (фото) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  bot.on("video", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.video) return;

    const video = ctx.message.video;
    pendingCreatives[ctx.from.id] = {
      type: "video",
      fileId: video.file_id,
      caption: ctx.message.caption || "",
    };

    await ctx.reply(
      "Креатив (видео) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  bot.on("text", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.text) return;

    const text = ctx.message.text;
    pendingCreatives[ctx.from.id] = {
      type: "text",
      text,
    };

    await ctx.reply(
      "Креатив (текст) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  bot.on("sticker", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.sticker) return;

    const sticker = ctx.message.sticker;
    pendingCreatives[ctx.from.id] = {
      type: "sticker",
      fileId: sticker.file_id,
    };

    await ctx.reply(
      "Креатив (стикер) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  bot.on("voice", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.voice) return;

    const voice = ctx.message.voice;
    pendingCreatives[ctx.from.id] = {
      type: "voice",
      fileId: voice.file_id,
    };

    await ctx.reply(
      "Креатив (голосовое сообщение) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  bot.on("video_note", async (ctx) => {
    if (!ctx.from) return;
    if (!(await isUserAdmin(ctx.from.id))) return;
    if (!ctx.message.video_note) return;

    const videoNote = ctx.message.video_note;
    pendingCreatives[ctx.from.id] = {
      type: "video_note",
      fileId: videoNote.file_id,
    };

    await ctx.reply(
      "Креатив (кружочек) загружен. Отправить его всем пользователям?",
      Markup.inlineKeyboard([
        Markup.button.callback("Да", "confirm_broadcast"),
        Markup.button.callback("Нет", "cancel_broadcast"),
      ])
    );
  });

  //
  // ============ Подтверждение рассылки ============
  //
  bot.action("confirm_broadcast", async (ctx) => {
    await ctx.answerCbQuery();

    if (!ctx.from) {
      await ctx.reply("Неизвестный отправитель (ctx.from отсутствует).");
      return;
    }

    // Проверяем, что это действительно админ
    if (!(await isUserAdmin(ctx.from.id))) {
      await ctx.reply("У вас нет прав на рассылку.");
      return;
    }

    const creative = pendingCreatives[ctx.from.id];
    if (!creative) {
      await ctx.reply(
        "Нет креатива для рассылки (возможно, уже отправлено или сброшено)."
      );
      return;
    }

    // Из конфигов роль и лимит
    const role = config.roleForBroadcast || "client";
    const limit = config.broadcastLimit || 10000;

    const userIds = await getUserIdsByRole(role, limit);
    if (userIds.length === 0) {
      await ctx.reply("Нет пользователей для рассылки.");
      pendingCreatives[ctx.from.id] = null;
      return;
    }

    // Оцениваем время
    const chunkSize = 30;
    const chunkCount = Math.ceil(userIds.length / chunkSize);
    const estimatedTimeSec = chunkCount + 5;

    await ctx.reply(
      `Будет отправлено *${userIds.length}* пользователям.\n` +
        `Примерное время выполнения ~ *${estimatedTimeSec}* секунд.\n` +
        `Начинаем рассылку...`,
      { parse_mode: "Markdown" }
    );

    logger.info(
      `Рассылка: админ=${ctx.from.id}, тип=${creative.type}, ` +
        `пользователей=${userIds.length}, оценка=${estimatedTimeSec}s`
    );

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    // Разбиваем userIds на чанки
    const chunks = chunkArray(userIds, chunkSize);

    // Отправляем чанк за чанком
    for (const chunk of chunks) {
      // внутри чанка шлём параллельно
      await Promise.all(
        chunk.map(async (chatId) => {
          try {
            // 1) Отправляем сообщение пользователю
            switch (creative.type) {
              case "photo":
                if (creative.fileId) {
                  await ctx.telegram.sendPhoto(chatId, creative.fileId, {
                    caption: creative.caption,
                  });
                }
                break;
              case "video":
                if (creative.fileId) {
                  await ctx.telegram.sendVideo(chatId, creative.fileId, {
                    caption: creative.caption,
                  });
                }
                break;
              case "text":
                if (creative.text) {
                  // Если слишком длинный текст, разбиваем
                  if (creative.text.length > 4096) {
                    const parts = splitTextIntoMessages(creative.text);
                    for (const part of parts) {
                      await ctx.telegram.sendMessage(chatId, part);
                    }
                  } else {
                    await ctx.telegram.sendMessage(chatId, creative.text);
                  }
                }
                break;
              case "sticker":
                if (creative.fileId) {
                  await ctx.telegram.sendSticker(chatId, creative.fileId);
                }
                break;
              case "voice":
                if (creative.fileId) {
                  await ctx.telegram.sendVoice(chatId, creative.fileId);
                }
                break;
              case "video_note":
                if (creative.fileId) {
                  await ctx.telegram.sendVideoNote(chatId, creative.fileId);
                }
                break;
            }

            // 2) Увеличиваем счетчик рассылок в БД
            await prisma.telegramUser.update({
              where: { userId: BigInt(chatId) },
              data: {
                messagesSentCount: {
                  increment: 1,
                },
              },
            });

            successCount++;
          } catch (error) {
            failCount++;
            logger.error(`Ошибка при отправке пользователю ${chatId}:`, error);
          }
        })
      );
      // Задержка ~1 сек между чанками
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const endTime = Date.now();
    const totalTimeSec = Math.round((endTime - startTime) / 1000);

    logger.info(
      `Рассылка завершена: ` +
        `всего=${userIds.length}, success=${successCount}, fail=${failCount}, ` +
        `time=${totalTimeSec}сек.`
    );

    // Итоговое сообщение админу
    if (failCount === 0) {
      await ctx.reply(
        `Рассылка успешно завершена всем *${successCount}* пользователям!\n` +
          `Затрачено: ~${totalTimeSec} сек.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        `Рассылка завершена. Всего: ${userIds.length}, ` +
          `Успешно: ${successCount}, Ошибок: ${failCount}.\n` +
          `Затрачено ~${totalTimeSec} сек.`
      );
    }

    // Сбрасываем креатив
    pendingCreatives[ctx.from.id] = null;
  });

  //
  // ============ Отмена рассылки ============
  //
  bot.action("cancel_broadcast", async (ctx) => {
    await ctx.answerCbQuery(); // скрыть "часики"

    if (!ctx.from) return;

    if (!(await isUserAdmin(ctx.from.id))) {
      await ctx.reply("У вас нет прав на рассылку.");
      return;
    }

    pendingCreatives[ctx.from.id] = null;
    await ctx.reply("Рассылка отменена.");
  });
}
