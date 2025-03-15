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
exports.setupStatsCommand = setupStatsCommand;
const logger_1 = require("../logger/logger");
const __1 = require("..");
/**
 * Проверяем, является ли пользователь администратором (role = 'admin').
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
 * Функция регистрации команды /stats
 * Если пользователь админ, бот отправляет статистику, иначе — молчит.
 */
function setupStatsCommand(bot) {
    bot.command("stats", (ctx) => __awaiter(this, void 0, void 0, function* () {
        try {
            // Если нет ctx.from, не можем определить пользователя
            if (!ctx.from) {
                return; // молчим
            }
            // Проверяем, админ ли
            const adminCheck = yield isUserAdmin(ctx.from.id);
            if (!adminCheck) {
                // Не админ — молчим
                return;
            }
            // =============== Собираем статистику ===============
            // 1) Всего пользователей
            const totalUsers = yield __1.prisma.telegramUser.count();
            // 2) Сколько из них админов
            const totalAdmins = yield __1.prisma.telegramUser.count({
                where: { role: "admin" },
            });
            // 3) Сколько зарегистрировалось сегодня
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);
            // Если нужно локальное время, используйте setHours(0,0,0,0)
            const registeredToday = yield __1.prisma.telegramUser.count({
                where: {
                    createdAt: {
                        gte: startOfDay,
                    },
                },
            });
            // 4) Количество premium-пользователей (если в схеме есть поле isPremium)
            const premiumCount = yield __1.prisma.telegramUser.count({
                where: { isPremium: true },
            });
            // =============== Формируем ответ для админа ===============
            let statsMessage = "📊 *Статистика бота*\n\n";
            statsMessage += `• Всего пользователей: *${totalUsers}*\n`;
            statsMessage += `  (из них админов: *${totalAdmins}*)\n`;
            statsMessage += `• Зарегистрировалось сегодня: *${registeredToday}*\n`;
            statsMessage += `• Премиум пользователей: *${premiumCount}*\n`;
            // Отправляем сообщение с статистикой
            yield ctx.reply(statsMessage, { parse_mode: "Markdown" });
        }
        catch (error) {
            // Логируем ошибку, но пользователю/админу можем ничего не отвечать
            logger_1.logger.error("Ошибка при обработке /stats:", error);
        }
    }));
}
