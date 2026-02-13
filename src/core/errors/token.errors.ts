export class TokenError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

export class TokenNotFoundError extends TokenError {
  constructor(identifier: string) {
    super(`Token "${identifier}" not found`, 'TOKEN_NOT_FOUND', { identifier });
    this.name = 'TokenNotFoundError';
  }
}
