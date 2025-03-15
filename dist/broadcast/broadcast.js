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
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupBroadcast = setupBroadcast;
const telegraf_1 = require("telegraf");
const logger_1 = require("../logger/logger");
const __1 = require("..");
const config_1 = require("../config");
// Хранение загруженного креатива для каждого админа (key = adminId)
const pendingCreatives = {};
/**
 * Проверяем, является ли пользователь администратором (role = 'admin').
 * Если пользователь не найден или role != 'admin', вернём false.
 */
function isUserAdmin(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield __1.prisma.telegramUser.findUnique({
            where: { userId: BigInt(userId) },
        });
        return (user === null || user === void 0 ? void 0 : user.role) === "admin";
    });
}
/**
 * Получаем список userId из БД по заданной роли.
 * Сортируем по убыванию createdAt (сначала самые новые).
 * Ограничиваем результат `limit`.
 * Возвращаем массив обычных чисел (из BigInt).
 */
function getUserIdsByRole(role, limit) {
    return __awaiter(this, void 0, void 0, function* () {
        const users = yield __1.prisma.telegramUser.findMany({
            where: { role },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { userId: true },
        });
        return users.map((u) => Number(u.userId));
    });
}
/**
 * Разбивает массив на чанки (по умолчанию размер чанка = 30),
 * чтобы не превысить rate-limit Telegram (≈30 сообщений/сек).
 */
function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
/**
 * Разбиваем слишком длинный текст (>4096) на несколько частей,
 * каждая <= 4096 символов, чтобы Telegram не выдал ошибку.
 */
function splitTextIntoMessages(text, maxLength = 4096) {
    const parts = [];
    let currentIndex = 0;
    while (currentIndex < text.length) {
        parts.push(text.slice(currentIndex, currentIndex + maxLength));
        currentIndex += maxLength;
    }
    return parts;
}
function setupBroadcast(bot) {
    //
    // ===== Обработчики медиа и текстов от админов =====
    //
    bot.on("photo", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.photo)
            return;
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        pendingCreatives[ctx.from.id] = {
            type: "photo",
            fileId,
            caption: ctx.message.caption || "",
        };
        yield ctx.reply("Креатив (фото) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    bot.on("video", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.video)
            return;
        const video = ctx.message.video;
        pendingCreatives[ctx.from.id] = {
            type: "video",
            fileId: video.file_id,
            caption: ctx.message.caption || "",
        };
        yield ctx.reply("Креатив (видео) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    bot.on("text", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.text)
            return;
        const text = ctx.message.text;
        pendingCreatives[ctx.from.id] = {
            type: "text",
            text,
        };
        yield ctx.reply("Креатив (текст) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    bot.on("sticker", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.sticker)
            return;
        const sticker = ctx.message.sticker;
        pendingCreatives[ctx.from.id] = {
            type: "sticker",
            fileId: sticker.file_id,
        };
        yield ctx.reply("Креатив (стикер) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    bot.on("voice", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.voice)
            return;
        const voice = ctx.message.voice;
        pendingCreatives[ctx.from.id] = {
            type: "voice",
            fileId: voice.file_id,
        };
        yield ctx.reply("Креатив (голосовое сообщение) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    bot.on("video_note", (ctx) => __awaiter(this, void 0, void 0, function* () {
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id)))
            return;
        if (!ctx.message.video_note)
            return;
        const videoNote = ctx.message.video_note;
        pendingCreatives[ctx.from.id] = {
            type: "video_note",
            fileId: videoNote.file_id,
        };
        yield ctx.reply("Креатив (кружочек) загружен. Отправить его всем пользователям?", telegraf_1.Markup.inlineKeyboard([
            telegraf_1.Markup.button.callback("Да", "confirm_broadcast"),
            telegraf_1.Markup.button.callback("Нет", "cancel_broadcast"),
        ]));
    }));
    //
    // ============ Подтверждение рассылки ============
    //
    bot.action("confirm_broadcast", (ctx) => __awaiter(this, void 0, void 0, function* () {
        yield ctx.answerCbQuery();
        if (!ctx.from) {
            yield ctx.reply("Неизвестный отправитель (ctx.from отсутствует).");
            return;
        }
        // Проверяем, что это действительно админ
        if (!(yield isUserAdmin(ctx.from.id))) {
            yield ctx.reply("У вас нет прав на рассылку.");
            return;
        }
        const creative = pendingCreatives[ctx.from.id];
        if (!creative) {
            yield ctx.reply("Нет креатива для рассылки (возможно, уже отправлено или сброшено).");
            return;
        }
        // Из конфигов роль и лимит
        const role = config_1.config.roleForBroadcast || "client";
        const limit = config_1.config.broadcastLimit || 10000;
        const userIds = yield getUserIdsByRole(role, limit);
        if (userIds.length === 0) {
            yield ctx.reply("Нет пользователей для рассылки.");
            pendingCreatives[ctx.from.id] = null;
            return;
        }
        // Оцениваем время
        const chunkSize = 30;
        const chunkCount = Math.ceil(userIds.length / chunkSize);
        const estimatedTimeSec = chunkCount + 5;
        yield ctx.reply(`Будет отправлено *${userIds.length}* пользователям.\n` +
            `Примерное время выполнения ~ *${estimatedTimeSec}* секунд.\n` +
            `Начинаем рассылку...`, { parse_mode: "Markdown" });
        logger_1.logger.info(`Рассылка: админ=${ctx.from.id}, тип=${creative.type}, ` +
            `пользователей=${userIds.length}, оценка=${estimatedTimeSec}s`);
        const startTime = Date.now();
        let successCount = 0;
        let failCount = 0;
        // Разбиваем userIds на чанки
        const chunks = chunkArray(userIds, chunkSize);
        // Отправляем чанк за чанком
        for (const chunk of chunks) {
            // внутри чанка шлём параллельно
            yield Promise.all(chunk.map((chatId) => __awaiter(this, void 0, void 0, function* () {
                try {
                    // 1) Отправляем сообщение пользователю
                    switch (creative.type) {
                        case "photo":
                            if (creative.fileId) {
                                yield ctx.telegram.sendPhoto(chatId, creative.fileId, {
                                    caption: creative.caption,
                                });
                            }
                            break;
                        case "video":
                            if (creative.fileId) {
                                yield ctx.telegram.sendVideo(chatId, creative.fileId, {
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
                                        yield ctx.telegram.sendMessage(chatId, part);
                                    }
                                }
                                else {
                                    yield ctx.telegram.sendMessage(chatId, creative.text);
                                }
                            }
                            break;
                        case "sticker":
                            if (creative.fileId) {
                                yield ctx.telegram.sendSticker(chatId, creative.fileId);
                            }
                            break;
                        case "voice":
                            if (creative.fileId) {
                                yield ctx.telegram.sendVoice(chatId, creative.fileId);
                            }
                            break;
                        case "video_note":
                            if (creative.fileId) {
                                yield ctx.telegram.sendVideoNote(chatId, creative.fileId);
                            }
                            break;
                    }
                    // 2) Увеличиваем счетчик рассылок в БД
                    yield __1.prisma.telegramUser.update({
                        where: { userId: BigInt(chatId) },
                        data: {
                            messagesSentCount: {
                                increment: 1,
                            },
                        },
                    });
                    successCount++;
                }
                catch (error) {
                    failCount++;
                    logger_1.logger.error(`Ошибка при отправке пользователю ${chatId}:`, error);
                }
            })));
            // Задержка ~1 сек между чанками
            yield new Promise((resolve) => setTimeout(resolve, 1000));
        }
        const endTime = Date.now();
        const totalTimeSec = Math.round((endTime - startTime) / 1000);
        logger_1.logger.info(`Рассылка завершена: ` +
            `всего=${userIds.length}, success=${successCount}, fail=${failCount}, ` +
            `time=${totalTimeSec}сек.`);
        // Итоговое сообщение админу
        if (failCount === 0) {
            yield ctx.reply(`Рассылка успешно завершена всем *${successCount}* пользователям!\n` +
                `Затрачено: ~${totalTimeSec} сек.`, { parse_mode: "Markdown" });
        }
        else {
            yield ctx.reply(`Рассылка завершена. Всего: ${userIds.length}, ` +
                `Успешно: ${successCount}, Ошибок: ${failCount}.\n` +
                `Затрачено ~${totalTimeSec} сек.`);
        }
        // Сбрасываем креатив
        pendingCreatives[ctx.from.id] = null;
    }));
    //
    // ============ Отмена рассылки ============
    //
    bot.action("cancel_broadcast", (ctx) => __awaiter(this, void 0, void 0, function* () {
        yield ctx.answerCbQuery(); // скрыть "часики"
        if (!ctx.from)
            return;
        if (!(yield isUserAdmin(ctx.from.id))) {
            yield ctx.reply("У вас нет прав на рассылку.");
            return;
        }
        pendingCreatives[ctx.from.id] = null;
        yield ctx.reply("Рассылка отменена.");
    }));
}
