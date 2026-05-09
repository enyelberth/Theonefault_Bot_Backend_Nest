import { Logger } from '@nestjs/common';

/**
 * Binance API error codes
 * @see https://binance-docs.github.io/apidocs/spot/en/#error-codes
 */
export enum BinanceErrorCode {
  // Client errors (4xx)
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  TOO_MANY_REQUESTS = 429,

  // Server errors (5xx)
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/**
 * Binance API error response format
 */
export interface BinanceErrorResponse {
  code: number;
  msg: string;
}

/**
 * Classification of error severity
 */
export enum ErrorSeverity {
  TRANSIENT = 'TRANSIENT', // Retryable
  RATE_LIMIT = 'RATE_LIMIT', // Need to wait
  INVALID_REQUEST = 'INVALID_REQUEST', // Client error, don't retry
  SERVER_ERROR = 'SERVER_ERROR', // Server issue, may retry
  UNKNOWN = 'UNKNOWN',
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Utility for handling Binance API errors with retry logic
 */
export class BinanceErrorHandler {
  private readonly logger = new Logger(BinanceErrorHandler.name);

  /**
   * Classify error severity for retry decisions
   */
  classifyError(error: any): ErrorSeverity {
    if (!error) {
      return ErrorSeverity.UNKNOWN;
    }

    // Handle axios error responses
    if (error.response?.status) {
      const status = error.response.status;
      const binanceCode = error.response?.data?.code;

      // Rate limiting
      if (status === BinanceErrorCode.TOO_MANY_REQUESTS) {
        return ErrorSeverity.RATE_LIMIT;
      }

      // Server errors (transient)
      if (status >= 500) {
        return ErrorSeverity.SERVER_ERROR;
      }

      // Client errors (not retryable)
      if (status >= 400 && status < 500) {
        return ErrorSeverity.INVALID_REQUEST;
      }
    }

    // Binance specific error codes
    if (error.response?.data?.code) {
      const code = error.response.data.code;

      // Known transient errors
      const transientCodes = [
        -1000, // Invalid request weight
        -1001, // Disconected
        -1002, // Unauthorized
        -1003, // Too many requests
        -1006, // Unknown error
        -1007, // Timeout
      ];

      if (transientCodes.includes(code)) {
        return ErrorSeverity.TRANSIENT;
      }

      // Known client errors
      const clientErrorCodes = [
        -1021, // Timestamp for this request was 1000ms ahead
        -1022, // Invalid signature
        -1100, // Illegal characters
        -1101, // Too many parameters
        -1102, // Mandatory parameter missing
        -1104, // Duplicate values for a parameter
        -1105, // Invalid orderType
        -2010, // New order rejected
        -2015, // Invalid API-key, IP, or permissions for action
      ];

      if (clientErrorCodes.includes(code)) {
        return ErrorSeverity.INVALID_REQUEST;
      }
    }

    // Network errors (transient)
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND'
    ) {
      return ErrorSeverity.TRANSIENT;
    }

    return ErrorSeverity.UNKNOWN;
  }

  /**
   * Determine if error is retryable
   */
  isRetryable(error: any): boolean {
    const severity = this.classifyError(error);
    return [
      ErrorSeverity.TRANSIENT,
      ErrorSeverity.SERVER_ERROR,
      ErrorSeverity.RATE_LIMIT,
    ].includes(severity);
  }

  /**
   * Calculate delay for exponential backoff
   */
  getRetryDelay(
    attemptNumber: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
  ): number {
    const exponentialDelay =
      config.baseDelayMs *
      Math.pow(config.backoffMultiplier, attemptNumber - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    // Add jitter (±10%)
    const jitter = cappedDelay * (0.9 + Math.random() * 0.2);
    return Math.round(jitter);
  }

  /**
   * Extract meaningful error message
   */
  getErrorMessage(error: any): string {
    if (error?.response?.data?.msg) {
      return error.response.data.msg;
    }
    if (error?.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * Get user-friendly error message based on error type
   */
  getUserMessage(error: any): string {
    const severity = this.classifyError(error);

    switch (severity) {
      case ErrorSeverity.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again.';
      case ErrorSeverity.SERVER_ERROR:
        return 'Binance server error. Please try again later.';
      case ErrorSeverity.INVALID_REQUEST:
        return `Invalid request: ${this.getErrorMessage(error)}`;
      case ErrorSeverity.TRANSIENT:
        return 'Temporary connection issue. Please try again.';
      default:
        return `Error: ${this.getErrorMessage(error)}`;
    }
  }

  /**
   * Log error with context
   */
  logError(
    error: any,
    context: {
      service: string;
      operation: string;
      params?: Record<string, any>;
      attempt?: number;
      maxAttempts?: number;
    },
  ): void {
    const severity = this.classifyError(error);
    const message = this.getErrorMessage(error);
    const attemptInfo = context.attempt
      ? ` (attempt ${context.attempt}/${context.maxAttempts})`
      : '';

    this.logger.warn(
      `[${context.service}.${context.operation}]${attemptInfo} ${severity}: ${message}`,
      {
        service: context.service,
        operation: context.operation,
        severity,
        params: context.params,
        errorCode: error?.response?.data?.code || error?.code,
        statusCode: error?.response?.status,
      },
    );
  }

  /**
   * Execute function with retry logic
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    context: {
      service: string;
      operation: string;
      params?: Record<string, any>;
    },
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (!this.isRetryable(error) || attempt === config.maxAttempts) {
          this.logError(error, {
            ...context,
            attempt,
            maxAttempts: config.maxAttempts,
          });
          throw error;
        }

        const delay = this.getRetryDelay(attempt, config);
        this.logger.debug(
          `[${context.service}.${context.operation}] Retrying after ${delay}ms (attempt ${attempt}/${config.maxAttempts})`,
          { severity: this.classifyError(error), delay },
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a Binance-specific error
 */
export class BinanceApiError extends Error {
  constructor(
    public readonly statusCode: number | undefined,
    public readonly binanceCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'BinanceApiError';
  }
}
