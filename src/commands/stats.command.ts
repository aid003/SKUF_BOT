import { Telegraf } from "telegraf";
import { logger } from "../logger/logger";
import { prisma } from "..";

/**
 * Проверяем, является ли пользователь администратором (role = 'admin').
 */
async function isUserAdmin(userId: number): Promise<boolean> {
  const user = await prisma.telegramUser.findUnique({
    where: { userId: BigInt(userId) },
  });
  return user?.role === "admin";
}

/**
 * Функция регистрации команды /stats
 * Если пользователь админ, бот отправляет статистику, иначе — молчит.
 */
export function setupStatsCommand(bot: Telegraf) {
  bot.command("stats", async (ctx) => {
    try {
      // Если нет ctx.from, не можем определить пользователя
      if (!ctx.from) {
        return; // молчим
      }

      // Проверяем, админ ли
      const adminCheck = await isUserAdmin(ctx.from.id);
      if (!adminCheck) {
        // Не админ — молчим
        return;
      }

      // =============== Собираем статистику ===============
      // 1) Всего пользователей
      const totalUsers = await prisma.telegramUser.count();

      // 2) Сколько из них админов
      const totalAdmins = await prisma.telegramUser.count({
        where: { role: "admin" },
      });

      // 3) Сколько зарегистрировалось сегодня
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      // Если нужно локальное время, используйте setHours(0,0,0,0)

      const registeredToday = await prisma.telegramUser.count({
        where: {
          createdAt: {
            gte: startOfDay,
          },
        },
      });

      // 4) Количество premium-пользователей (если в схеме есть поле isPremium)
      const premiumCount = await prisma.telegramUser.count({
        where: { isPremium: true },
      });

      // =============== Формируем ответ для админа ===============
      let statsMessage = "📊 *Статистика бота*\n\n";
      statsMessage += `• Всего пользователей: *${totalUsers}*\n`;
      statsMessage += `  (из них админов: *${totalAdmins}*)\n`;
      statsMessage += `• Зарегистрировалось сегодня: *${registeredToday}*\n`;
      statsMessage += `• Премиум пользователей: *${premiumCount}*\n`;

      // Отправляем сообщение с статистикой
      await ctx.reply(statsMessage, { parse_mode: "Markdown" });
    } catch (error) {
      // Логируем ошибку, но пользователю/админу можем ничего не отвечать
      logger.error("Ошибка при обработке /stats:", error);
    }
  });
}
