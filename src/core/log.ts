import pino, { type Logger } from "pino";
import pretty from "pino-pretty";

export function createLogger(name: string): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      name,
    },
    pretty({
      colorize: true,
      ignore: "pid,hostname",
      sync: true,
      translateTime: "HH:MM:ss",
    }),
  );
}
