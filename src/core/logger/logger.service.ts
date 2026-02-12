import pino, { Logger as PinoLogger } from 'pino';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigurationService } from '../config/configuration.service';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class LoggerService {
  private static instance: LoggerService;
  private logger: PinoLogger;
  private isVerbose: boolean = false;

  private constructor() {
    this.logger = this.createLogger();
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  static resetInstance(): void {
    LoggerService.instance = null as unknown as LoggerService;
  }

  setVerbose(verbose: boolean): void {
    if (this.isVerbose !== verbose) {
      this.isVerbose = verbose;
      this.logger = this.createLogger();
    }
  }

  private createLogger(): PinoLogger {
    const configService = ConfigurationService.getInstance();
    const config = configService.getConfig();

    const logLevel = (config.logging?.level || 'info') as LogLevel;
    const logToConsole = this.isVerbose || config.logging?.console || false;
    const logToFile = config.logging?.file !== false; // Default to true
    const maxFiles = config.logging?.maxFiles || 30;

    const pathManager = configService.getPathManager();
    const logFilePath = path.join(pathManager.getLogsDir(), 'jupiter.log');

    // Ensure logs directory exists
    if (logToFile) {
      fs.mkdirSync(pathManager.getLogsDir(), { recursive: true });
    }

    const streams: pino.StreamEntry[] = [];

    // File output with rotation (always enabled by default)
    if (logToFile) {
      streams.push({
        level: logLevel,
        stream: pino.transport({
          target: 'pino-roll',
          options: {
            file: logFilePath,
            frequency: 'daily',
            maxFiles: maxFiles,
            mkdir: true,
            sync: true,
          },
        }) as unknown as NodeJS.WritableStream,
      });
    }

    // Console output (verbose mode only)
    if (logToConsole) {
      streams.push({
        level: logLevel,
        stream: pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }) as unknown as NodeJS.WritableStream,
      });
    }

    // If no transports, use silent logger
    if (streams.length === 0) {
      return pino({ level: 'silent' });
    }

    // Single stream
    if (streams.length === 1) {
      return pino({ level: logLevel, base: undefined }, streams[0]!.stream);
    }

    // Multiple streams (file + console)
    return pino({ level: logLevel, base: undefined }, pino.multistream(streams));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context || {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context || {}, message);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.logger.error(
      {
        ...context,
        err: error,
      },
      message
    );
  }
}
