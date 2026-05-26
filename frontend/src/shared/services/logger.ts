/**
 * Structured console logger with levels and contextual prefixes.
 *
 * Usage:
 *   import { createLogger } from "@/shared/services/logger";
 *   const log = createLogger("EditorPage");
 *   log.info("Query executed", { rowCount: 42 });
 *   log.error("Failed to fetch", error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  if (import.meta.env.DEV) return "debug";
  return "warn";
}

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

export function createLogger(context: string): Logger {
  const minLevel = getMinLevel();

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
  }

  function formatPrefix(level: LogLevel): string {
    const timestamp = new Date().toISOString().slice(11, 23);
    return `${timestamp} | ${level.toUpperCase().padEnd(5)} | ${context}`;
  }

  return {
    debug(message: string, ...args: unknown[]) {
      if (!shouldLog("debug")) return;
      console.debug(`${formatPrefix("debug")} | ${message}`, ...args);
    },
    info(message: string, ...args: unknown[]) {
      if (!shouldLog("info")) return;
      console.info(`${formatPrefix("info")} | ${message}`, ...args);
    },
    warn(message: string, ...args: unknown[]) {
      if (!shouldLog("warn")) return;
      console.warn(`${formatPrefix("warn")} | ${message}`, ...args);
    },
    error(message: string, ...args: unknown[]) {
      if (!shouldLog("error")) return;
      console.error(`${formatPrefix("error")} | ${message}`, ...args);
    },
  };
}
