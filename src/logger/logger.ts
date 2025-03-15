import log4js from "log4js";

log4js.configure({
  appenders: {
    console: { type: "stdout" },
    file: { type: "file", filename: "app.log" },
  },
  categories: { default: { appenders: ["console", "file"], level: "debug" } },
});

export const logger = log4js.getLogger();
