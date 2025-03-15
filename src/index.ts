import { Telegraf } from "telegraf";
import { config } from "./config";
import { setupCommands } from "./commands";
import { setupBroadcast } from "./broadcast/broadcast";
import { logger } from "./logger/logger";
import { PrismaClient } from "@prisma/client";

if (!config.botToken) {
  logger.error("BOT_TOKEN не найден в конфигурации");
  process.exit(1);
}

export const prisma = new PrismaClient();
const bot = new Telegraf(config.botToken);

setupCommands(bot);

setupBroadcast(bot);

logger.info(`Бот успешно запущен на порту ${config.port}`);
bot.launch().catch((error) => {
  logger.error("Ошибка при запуске бота:", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
