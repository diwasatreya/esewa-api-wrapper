/**
 * @module errors
 * @description Custom error classes for the eSewa API Wrapper.
 * All errors extend `EsewaError` which provides structured error information
 * including error codes, descriptive messages, and optional cause chaining.
 */

import { EsewaErrorCode } from './types';

/**
 * Base error class for all eSewa API Wrapper errors.
 *
 * Provides structured error information including:
 * - A machine-readable `code` for programmatic error handling
 * - A human-readable `message` for developers
 * - An optional `cause` for error chain tracing
 * - Optional `details` with additional context
 *
 * @example
 * ```typescript
 * try {
 *   await esewa.verifyPayment({ ... });
 * } catch (error) {
 *   if (error instanceof EsewaError) {
 *     console.error(`[${error.code}] ${error.message}`);
 *   }
 * }
 * ```
 */
export class EsewaError extends Error {
  /** Machine-readable error code. */
  public readonly code: EsewaErrorCode;

  /** Additional details about the error. */
  public readonly details?: Record<string, unknown>;

  /** The original error that caused this error, if any. */
  public readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code?: EsewaErrorCode;
      cause?: Error;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'EsewaError';
    this.code = options.code ?? EsewaErrorCode.UNKNOWN_ERROR;
    this.details = options.details;
    this.cause = options.cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a structured JSON representation of the error.
   * Sensitive information is excluded from serialisation.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Thrown when input validation fails.
 *
 * Common causes:
 * - Missing required fields
 * - Invalid field formats (e.g., non-numeric amount)
 * - Values outside acceptable ranges
 *
 * @example
 * ```typescript
 * try {
 *   esewa.createPayment({ amount: -100, ... });
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error('Invalid input:', error.message);
 *   }
 * }
 * ```
 */
export class ValidationError extends EsewaError {
  constructor(message: string, options: { cause?: Error; details?: Record<string, unknown> } = {}) {
    super(message, {
      code: EsewaErrorCode.VALIDATION_ERROR,
      ...options,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when HMAC signature generation or verification fails.
 *
 * Common causes:
 * - Mismatched secret key
 * - Tampered response data
 * - Malformed Base64 signature
 *
 * @example
 * ```typescript
 * try {
 *   esewa.decodeResponse(encodedData);
 * } catch (error) {
 *   if (error instanceof SignatureError) {
 *     console.error('Possible tampering detected:', error.message);
 *   }
 * }
 * ```
 */
export class SignatureError extends EsewaError {
  constructor(message: string, options: { cause?: Error; details?: Record<string, unknown> } = {}) {
    super(message, {
      code: EsewaErrorCode.SIGNATURE_ERROR,
      ...options,
    });
    this.name = 'SignatureError';
  }
}

/**
 * Thrown when a network request to eSewa's API fails.
 *
 * Common causes:
 * - Connection timeout
 * - DNS resolution failure
 * - Server returned HTTP 5xx
 * - Request aborted
 *
 * @example
 * ```typescript
 * try {
 *   await esewa.verifyPayment({ ... });
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     console.error('eSewa API unreachable:', error.message);
 *     // Implement fallback or retry logic
 *   }
 * }
 * ```
 */
export class NetworkError extends EsewaError {
  constructor(message: string, options: { cause?: Error; details?: Record<string, unknown> } = {}) {
    super(message, {
      code: EsewaErrorCode.NETWORK_ERROR,
      ...options,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Thrown when the eSewa client is misconfigured.
 *
 * Common causes:
 * - Missing environment variables
 * - Invalid environment setting
 * - Missing secret key or merchant ID
 */
export class ConfigurationError extends EsewaError {
  constructor(message: string, options: { cause?: Error; details?: Record<string, unknown> } = {}) {
    super(message, {
      code: EsewaErrorCode.CONFIGURATION_ERROR,
      ...options,
    });
    this.name = 'ConfigurationError';
  }
}
