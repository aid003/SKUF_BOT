import { Context } from "telegraf";

export async function safeExecute(ctx: Context, callback: () => Promise<void>) {
  try {
    await callback();
  } catch (error) {
    console.error("Ошибка выполнения:", error);
    await ctx.reply("Произошла ошибка при выполнении запроса.");
  }
}
