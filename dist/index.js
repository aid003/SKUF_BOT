"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = exports.prisma = void 0;
const telegraf_1 = require("telegraf");
const config_1 = require("./config");
const commands_1 = require("./commands");
const broadcast_1 = require("./broadcast/broadcast");
const logger_1 = require("./logger/logger");
const client_1 = require("@prisma/client");
require("./server");
if (!config_1.config.botToken) {
    logger_1.logger.error("BOT_TOKEN не найден в конфигурации");
    process.exit(1);
}
exports.prisma = new client_1.PrismaClient();
exports.bot = new telegraf_1.Telegraf(config_1.config.botToken);
(0, commands_1.setupCommands)(exports.bot);
(0, broadcast_1.setupBroadcast)(exports.bot);
logger_1.logger.info(`🚀 Бот успешно запущен`);
exports.bot.launch().catch((error) => {
    logger_1.logger.error("Ошибка при запуске бота:", error);
    process.exit(1);
});
process.once("SIGINT", () => exports.bot.stop("SIGINT"));
process.once("SIGTERM", () => exports.bot.stop("SIGTERM"));
