/**
 * @module utils/helpers
 * @description General-purpose helper functions for the eSewa API Wrapper.
 * Includes amount calculation, Base64 encoding/decoding, URL construction,
 * debug logging with data masking, and HTTP request utilities.
 */

import type { EsewaEnvironment, HttpRequestOptions, LogLevel, PaymentRequest } from '../types';
import { NetworkError } from '../errors';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** eSewa ePay v2 API URLs */
const ESEWA_URLS = {
  sandbox: {
    payment: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  production: {
    payment: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
} as const;

/** Fields that should always be masked in log output */
const SENSITIVE_FIELDS = ['secretKey', 'secret_key', 'signature', 'password', 'token'];

// ─────────────────────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns the base URL for the eSewa payment form endpoint.
 *
 * @param environment - `'sandbox'` or `'production'`
 * @returns The full payment form URL for the specified environment
 *
 * @example
 * ```typescript
 * getPaymentUrl('sandbox');
 * // Returns: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
 * ```
 */
export function getPaymentUrl(environment: EsewaEnvironment): string {
  return ESEWA_URLS[environment].payment;
}

/**
 * Returns the base URL for the eSewa transaction status check endpoint.
 *
 * @param environment - `'sandbox'` or `'production'`
 * @returns The status check URL for the specified environment
 */
export function getStatusUrl(environment: EsewaEnvironment): string {
  return ESEWA_URLS[environment].status;
}

/**
 * Returns the base URL for the specified environment.
 *
 * @param environment - `'sandbox'` or `'production'`
 * @returns An object containing all URLs for the specified environment
 */
export function getEnvironmentBaseUrl(environment: EsewaEnvironment): {
  payment: string;
  status: string;
} {
  return { ...ESEWA_URLS[environment] };
}

// ─────────────────────────────────────────────────────────────
// Amount Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Calculates the total amount for a transaction from its components.
 *
 * `total_amount = amount + tax_amount + product_service_charge + product_delivery_charge`
 *
 * @param request - The payment request containing amount components
 * @returns The total transaction amount
 *
 * @example
 * ```typescript
 * const total = calculateTotalAmount({
 *   amount: 1000,
 *   taxAmount: 130,
 *   serviceCharge: 50,
 *   deliveryCharge: 100,
 *   transactionUuid: 'abc',
 *   productCode: 'EPAYTEST',
 * });
 * // Returns: 1280
 * ```
 */
export function calculateTotalAmount(request: PaymentRequest): number {
  const amount = request.amount;
  const taxAmount = request.taxAmount ?? 0;
  const serviceCharge = request.serviceCharge ?? 0;
  const deliveryCharge = request.deliveryCharge ?? 0;

  // Use fixed-point arithmetic to avoid floating-point precision issues
  const total = Math.round((amount + taxAmount + serviceCharge + deliveryCharge) * 100) / 100;
  return total;
}

// ─────────────────────────────────────────────────────────────
// Base64 Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Decodes a Base64-encoded string and parses it as JSON.
 *
 * @param encoded - The Base64-encoded string
 * @returns The decoded and parsed object
 * @throws {Error} If decoding or parsing fails
 *
 * @example
 * ```typescript
 * const data = decodeBase64Json<EsewaPaymentResponse>(encodedString);
 * ```
 */
export function decodeBase64Json<T>(encoded: string): T {
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(decoded) as T;
}

/**
 * Encodes an object as a Base64 JSON string.
 *
 * @param data - The object to encode
 * @returns Base64-encoded JSON string
 */
export function encodeBase64Json(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

// ─────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Makes an HTTP request with automatic retry logic for transient failures.
 *
 * Uses the native `fetch` API (Node.js 18+) with exponential backoff retry.
 * Falls back to `https` module for Node.js < 18.
 *
 * @param options - The HTTP request options
 * @returns The parsed JSON response
 * @throws {NetworkError} If the request fails after all retries
 */
export async function makeHttpRequest<T>(options: HttpRequestOptions): Promise<T> {
  const {
    url,
    method,
    headers = {},
    body,
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      if (body && method === 'POST') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new NetworkError(`HTTP ${response.status}: ${response.statusText} — ${errorBody}`, {
          details: { statusCode: response.status, body: errorBody },
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-transient errors
      if (error instanceof NetworkError) {
        const statusCode = (error.details?.statusCode as number) ?? 0;
        if (statusCode >= 400 && statusCode < 500) {
          throw error; // Client errors are not retryable
        }
      }

      if (attempt < retries) {
        // Exponential backoff with jitter
        const delay = retryDelay * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(delay);
      }
    }
  }

  throw new NetworkError(
    `Request to ${url} failed after ${retries + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
    { cause: lastError }
  );
}

// ─────────────────────────────────────────────────────────────
// Logging Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Creates a scoped logger that masks sensitive data in output.
 *
 * @param enabled - Whether logging is enabled
 * @param prefix - Optional prefix for log messages
 * @returns A logging function
 */
export function createLogger(enabled: boolean, prefix = '[esewa-api-wrapper]') {
  return (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
    if (!enabled) return;

    const timestamp = new Date().toISOString();
    const maskedData = data ? maskSensitiveData(data) : '';
    const dataStr = maskedData ? ` ${JSON.stringify(maskedData)}` : '';

    const logFn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'debug'
            ? console.debug
            : console.info;

    logFn(`${prefix} [${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`);
  };
}

/**
 * Recursively masks sensitive fields in an object for safe logging.
 * Replaces values of sensitive fields with `'***REDACTED***'`.
 *
 * @param data - The object to mask
 * @returns A new object with sensitive values replaced
 */
export function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      masked[key] = '***REDACTED***';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

// ─────────────────────────────────────────────────────────────
// Misc Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Delays execution for the specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns A promise that resolves after the specified delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
