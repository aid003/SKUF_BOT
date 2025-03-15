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
exports.setupStartCommand = setupStartCommand;
const telegraf_1 = require("telegraf");
const escapeMarkdownV2_1 = require("../helpers/escapeMarkdownV2");
const logger_1 = require("../logger/logger");
const safeExecute_1 = require("../helpers/safeExecute");
const __1 = require("..");
const config_1 = require("../config");
const client_1 = require("@prisma/client");
function setupStartCommand(bot) {
    bot.start((ctx) => __awaiter(this, void 0, void 0, function* () {
        yield (0, safeExecute_1.safeExecute)(ctx, () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!ctx.from) {
                logger_1.logger.warn("ctx.from отсутствует при выполнении /start");
                return;
            }
            const userData = {
                userId: BigInt(ctx.from.id),
                isBot: ctx.from.is_bot,
                firstName: ctx.from.first_name,
                lastName: ctx.from.last_name || null,
                username: ctx.from.username || null,
                languageCode: ctx.from.language_code || null,
                isPremium: (_a = ctx.from.is_premium) !== null && _a !== void 0 ? _a : false,
                addedToAttachmentMenu: (_b = ctx.from.added_to_attachment_menu) !== null && _b !== void 0 ? _b : false,
            };
            try {
                const existingUser = yield __1.prisma.telegramUser.findUnique({
                    where: { userId: userData.userId },
                });
                if (!existingUser) {
                    yield __1.prisma.telegramUser.create({ data: userData });
                    logger_1.logger.info(`Новый пользователь: ID=${ctx.from.id} (${ctx.from.username}).`);
                }
                else {
                    yield __1.prisma.telegramUser.update({
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
                    logger_1.logger.info(`Пользователь повторно запустил /start: ID=${ctx.from.id} (${ctx.from.username}).`);
                }
            }
            catch (dbError) {
                logger_1.logger.error("Ошибка при работе с БД:", dbError);
                yield ctx.reply("Произошла ошибка при регистрации. Попробуйте позже!");
                return;
            }
            const safeFirstName = (0, escapeMarkdownV2_1.escapeMarkdownV2)(ctx.from.first_name || "Гость");
            const message = `*${safeFirstName}*, на связи *Скуфы маркетинга*👋\n\n` +
                `_Благодарю тебя за подписку, теперь ты не пропустишь самое важное\\!_\n\n` +
                `Этот бот создан для оповещения о наших мероприятиях и активностях, которые помогают селлерам выходить на новый уровень\\.\n\n` +
                `Подобные мероприятия обычно проходят не чаще 2х раз в месяц\\.\n\n` +
                `Для оплаты участия в мероприятии, перейдите по кнопке *"Оплатить"*\\.\n\n` +
                `Если тебе интересно узнать о ближайшем мероприятии, нажмите на кнопку *"Прислать анонс ближайшей программы"*`;
            try {
                yield ctx.reply(message, Object.assign({ parse_mode: "MarkdownV2" }, telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback("💳 Оплатить", "pay")],
                    [
                        telegraf_1.Markup.button.callback("📢 Прислать анонс ближайшей программы", "send_announcement"),
                    ],
                ])));
            }
            catch (tgError) {
                logger_1.logger.error("Ошибка при отправке приветственного сообщения:", tgError);
            }
        }));
    }));
    bot.action("pay", (ctx) => __awaiter(this, void 0, void 0, function* () {
        yield (0, safeExecute_1.safeExecute)(ctx, () => __awaiter(this, void 0, void 0, function* () {
            if (!ctx.from) {
                logger_1.logger.warn("Нажата кнопка 'pay', но ctx.from отсутствует.");
                return;
            }
            const userId = BigInt(ctx.from.id);
            const orderId = `order_${userId}_${Date.now()}`;
            // Формирование ссылки на оплату
            const paymentLink = `${config_1.config.paymentUrl}?order_id=${orderId}&user_id=${userId}&do=pay`;
            const message = `💳 *Оплата мероприятия*\n\n` +
                `Для оплаты перейдите по ссылке: [Оплатить](${paymentLink})`;
            try {
                yield __1.prisma.payment.create({
                    data: {
                        userId,
                        orderId,
                        amount: config_1.config.amount || 2000,
                        status: client_1.PaymentStatus.PENDING,
                        paymentMethod: null,
                    },
                });
                yield ctx.reply(message, Object.assign({ parse_mode: "MarkdownV2" }, telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.url("💳 Оплатить", paymentLink)],
                ])));
                logger_1.logger.info(`📩 Ссылка на оплату отправлена пользователю ${userId}.`);
            }
            catch (tgError) {
                logger_1.logger.error("❌ Ошибка при отправке ссылки на оплату:", tgError);
            }
            try {
                yield ctx.answerCbQuery();
            }
            catch (tgError) {
                logger_1.logger.warn("⚠️ Ошибка при answerCbQuery:", tgError);
            }
        }));
    }));
    bot.action("send_announcement", (ctx) => __awaiter(this, void 0, void 0, function* () {
        yield (0, safeExecute_1.safeExecute)(ctx, () => __awaiter(this, void 0, void 0, function* () {
            if (!ctx.from) {
                logger_1.logger.warn("Нажата кнопка 'send_announcement', но ctx.from отсутствует.");
                return;
            }
            try {
                const response = yield fetch(`${config_1.config.strapiUrl}/announcements`);
                if (!response.ok)
                    throw new Error(`Ошибка API: ${response.statusText}`);
                const data = yield response.json();
                if (!data || !data.data || !Array.isArray(data.data)) {
                    throw new Error("Некорректный формат ответа от Strapi");
                }
                const announcements = data.data
                    .map((item) => {
                    var _a;
                    if (!item.title || !item.date) {
                        logger_1.logger.warn("Некорректный объект анонса:", JSON.stringify(item));
                        return null;
                    }
                    return {
                        title: item.title,
                        date: new Date(item.date),
                        content: ((_a = item.content) === null || _a === void 0 ? void 0 : _a.trim()) || null,
                    };
                })
                    .filter((a) => a !== null)
                    .sort((a, b) => a.date.getTime() - b.date.getTime());
                if (announcements.length === 0) {
                    yield ctx.reply("❌ Нет доступных мероприятий.", {
                        parse_mode: "MarkdownV2",
                    });
                    return;
                }
                const nextEvent = announcements[0];
                const otherEvents = announcements.slice(1);
                const formatDateTime = (date) => date.toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                });
                const escapeMD = (text) => {
                    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
                };
                let message = `📅 *Ближайшее мероприятие*\n\n` +
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
                yield ctx.reply(message, { parse_mode: "MarkdownV2" });
            }
            catch (error) {
                logger_1.logger.error("Ошибка при получении анонсов:", error);
                yield ctx.reply("❌ Не удалось загрузить мероприятия.", {
                    parse_mode: "MarkdownV2",
                });
            }
            try {
                yield ctx.answerCbQuery();
            }
            catch (tgError) {
                logger_1.logger.warn("Ошибка при answerCbQuery:", tgError);
            }
        }));
    }));
}
