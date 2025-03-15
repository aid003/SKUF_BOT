"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCommands = setupCommands;
const start_command_1 = require("./start.command");
const stats_command_1 = require("./stats.command");
function setupCommands(bot) {
    (0, start_command_1.setupStartCommand)(bot);
    (0, stats_command_1.setupStatsCommand)(bot);
}
