export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  service: string;
  event: string;
  fields: Record<string, unknown>;
};

export type LoggerOptions = {
  service?: string;
  level?: LogLevel;
  fields?: Record<string, unknown>;
  now?: () => Date;
  sink?: (entry: LogEntry) => void;
};

const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} satisfies Record<LogLevel, number>;

export class Logger {
  private readonly service: string;
  private readonly level: LogLevel;
  private readonly fields: Record<string, unknown>;
  private readonly now: () => Date;
  private readonly sink: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    this.service = options.service ?? "tilezo";
    this.level = options.level ?? "info";
    this.fields = sanitizeFields(options.fields ?? {});
    this.now = options.now ?? (() => new Date());
    this.sink = options.sink ?? writeConsoleEntry;
  }

  child(fields: Record<string, unknown>): Logger {
    return new Logger({
      service: this.service,
      level: this.level,
      fields: { ...this.fields, ...fields },
      now: this.now,
      sink: this.sink,
    });
  }

  debug(event: string, fields: Record<string, unknown> = {}): void {
    this.write("debug", event, fields);
  }

  info(event: string, fields: Record<string, unknown> = {}): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    this.write("error", event, fields);
  }

  private write(level: LogLevel, event: string, fields: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) {
      return;
    }

    this.sink({
      timestamp: this.now().toISOString(),
      level,
      service: this.service,
      event,
      fields: sanitizeFields({ ...this.fields, ...fields }),
    });
  }
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

export function parseLogLevel(value: string | undefined): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error"
    ? value
    : "info";
}

function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function writeConsoleEntry(entry: LogEntry): void {
  const line = JSON.stringify(entry);

  if (entry.level === "error") {
    console.error(line);
    return;
  }

  if (entry.level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
