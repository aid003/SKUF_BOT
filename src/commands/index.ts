import { Telegraf } from "telegraf";
import { setupStartCommand } from "./start.command";
import { setupStatsCommand } from "./stats.command";

export function setupCommands(bot: Telegraf) {
  setupStartCommand(bot);
  setupStatsCommand(bot);
}
