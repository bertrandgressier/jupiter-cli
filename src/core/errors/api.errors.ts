export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class JupiterApiError extends ApiError {
  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message, 'JUPITER_API_ERROR', statusCode, details);
    this.name = 'JupiterApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends ApiError {
  constructor(url: string, originalError?: Error) {
    super(`Network error calling ${url}`, 'NETWORK_ERROR', undefined, {
      url,
      originalError: originalError?.message,
    });
    this.name = 'NetworkError';
  }
}
