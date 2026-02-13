import axios, { AxiosInstance, AxiosError } from 'axios';
import { ConfigurationService } from '../../../core/config/configuration.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { JupiterApiError, RateLimitError, NetworkError } from '../../../core/errors/api.errors';

export class JupiterClient {
  private client: AxiosInstance;
  private maxRetries: number;
  private baseDelay: number;
  private configService: ConfigurationService;

  constructor() {
    this.configService = ConfigurationService.getInstance();
    this.maxRetries = this.configService.getConfig().jupiter.maxRetries;
    this.baseDelay = 1000;

    this.client = axios.create({
      baseURL: this.configService.getConfig().jupiter.baseUrl,
      timeout: this.configService.getConfig().jupiter.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(this.configService.getConfig().jupiter.apiKey
          ? {
              'x-api-key': this.configService.getConfig().jupiter.apiKey,
            }
          : {}),
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        LoggerService.getInstance().debug(
          `Jupiter API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        return this.handleError(error);
      }
    );
  }

  private async handleError(error: AxiosError): Promise<never> {
    if (!error.response) {
      throw new NetworkError(error.config?.url || 'unknown', error);
    }

    const status = error.response.status;
    const data = error.response.data;

    LoggerService.getInstance().error('Jupiter API error response', undefined, {
      status,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });

    if (status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
      throw new RateLimitError(retryAfter);
    }

    const errorMessage = this.extractErrorMessage(data) || error.message;
    throw new JupiterApiError(
      errorMessage,
      status,
      typeof data === 'object' ? (data as Record<string, unknown>) : { raw: data }
    );
  }

  private extractErrorMessage(data: unknown): string | null {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.message === 'string') return obj.message;
    if (obj.error && typeof obj.error === 'object' && 'message' in obj.error) {
      return String((obj.error as Record<string, unknown>).message);
    }

    return null;
  }

  async get<T>(
    url: string,
    params?: Record<string, string | number | boolean>,
    retries = 0
  ): Promise<T> {
    try {
      const response = await this.client.get<T>(url, { params });
      return response.data;
    } catch (error) {
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.baseDelay * Math.pow(2, retries);
        LoggerService.getInstance().warn(
          `Retrying request after ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`
        );
        await this.sleep(delay);
        return this.get(url, params, retries + 1);
      }
      throw error;
    }
  }

  async post<T>(url: string, data?: unknown, retries = 0): Promise<T> {
    try {
      const response = await this.client.post<T>(url, data);
      return response.data;
    } catch (error) {
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.baseDelay * Math.pow(2, retries);
        LoggerService.getInstance().warn(
          `Retrying request after ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`
        );
        await this.sleep(delay);
        return this.post(url, data, retries + 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof NetworkError) return true;
    if (error instanceof JupiterApiError) {
      return error.statusCode === 502 || error.statusCode === 503 || error.statusCode === 504;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const jupiterClient = new JupiterClient();
