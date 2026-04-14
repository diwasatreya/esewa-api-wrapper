/**
 * @module config
 * @description Configuration management for the eSewa API Wrapper.
 * Handles merging user-provided configuration with sensible defaults,
 * validating all options, and providing frozen configuration objects.
 */

import type { EsewaConfig } from './types';
import { validateConfig } from './utils/validator';

/**
 * Default configuration values applied when the user doesn't specify them.
 */
const DEFAULT_CONFIG: Partial<EsewaConfig> = {
  enableLogging: false,
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
};

/**
 * Creates a validated and frozen configuration object by merging
 * user-provided options with sensible defaults.
 *
 * The returned object is frozen (immutable) to prevent accidental
 * mutation of configuration at runtime.
 *
 * @param userConfig - User-provided configuration options
 * @returns A fully resolved and validated configuration object
 * @throws {ValidationError} If the configuration is invalid
 *
 * @example
 * ```typescript
 * const config = createConfig({
 *   merchantId: 'MY_MERCHANT',
 *   secretKey: process.env.ESEWA_SECRET_KEY!,
 *   environment: 'sandbox',
 *   successUrl: 'https://example.com/success',
 *   failureUrl: 'https://example.com/failure',
 * });
 * ```
 */
export function createConfig(userConfig: EsewaConfig): Readonly<Required<EsewaConfig>> {
  const merged = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  } as Required<EsewaConfig>;

  // Validate the merged configuration
  validateConfig(merged);

  // Return a frozen (immutable) copy
  return Object.freeze(merged);
}

/**
 * Retrieves configuration from environment variables as a fallback.
 *
 * Looks for the following environment variables:
 * - `ESEWA_MERCHANT_ID`
 * - `ESEWA_SECRET_KEY`
 * - `ESEWA_ENVIRONMENT`
 * - `ESEWA_SUCCESS_URL`
 * - `ESEWA_FAILURE_URL`
 *
 * @returns A partial configuration object from environment variables
 */
export function getConfigFromEnv(): Partial<EsewaConfig> {
  return {
    ...(process.env.ESEWA_MERCHANT_ID && { merchantId: process.env.ESEWA_MERCHANT_ID }),
    ...(process.env.ESEWA_SECRET_KEY && { secretKey: process.env.ESEWA_SECRET_KEY }),
    ...(process.env.ESEWA_ENVIRONMENT && {
      environment: process.env.ESEWA_ENVIRONMENT as EsewaConfig['environment'],
    }),
    ...(process.env.ESEWA_SUCCESS_URL && { successUrl: process.env.ESEWA_SUCCESS_URL }),
    ...(process.env.ESEWA_FAILURE_URL && { failureUrl: process.env.ESEWA_FAILURE_URL }),
  };
}
