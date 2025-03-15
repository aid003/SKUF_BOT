"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const telegraf_1 = require("telegraf");
const config_1 = require("./config");
const commands_1 = require("./commands");
const broadcast_1 = require("./broadcast/broadcast");
const logger_1 = require("./logger/logger");
const client_1 = require("@prisma/client");
if (!config_1.config.botToken) {
    logger_1.logger.error("BOT_TOKEN не найден в конфигурации");
    process.exit(1);
}
exports.prisma = new client_1.PrismaClient();
const bot = new telegraf_1.Telegraf(config_1.config.botToken);
(0, commands_1.setupCommands)(bot);
(0, broadcast_1.setupBroadcast)(bot);
logger_1.logger.info(`Бот успешно запущен на порту ${config_1.config.port}`);
bot.launch().catch((error) => {
    logger_1.logger.error("Ошибка при запуске бота:", error);
    process.exit(1);
});
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
