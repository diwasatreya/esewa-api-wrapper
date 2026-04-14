/**
 * @module esewa-api-wrapper
 * @description A secure and developer-friendly Node.js wrapper for seamless
 * integration with the eSewa Payment Gateway.
 *
 * @example
 * ```typescript
 * import { EsewaClient } from 'esewa-api-wrapper';
 *
 * const esewa = new EsewaClient({
 *   merchantId: 'YOUR_MERCHANT_ID',
 *   secretKey: process.env.ESEWA_SECRET_KEY!,
 *   environment: 'sandbox',
 *   successUrl: 'https://yourdomain.com/payment/success',
 *   failureUrl: 'https://yourdomain.com/payment/failure',
 * });
 * ```
 *
 * @packageDocumentation
 */

// ─── Main Client ────────────────────────────────────────────
export { EsewaClient } from './client.js';

// ─── Type Definitions ───────────────────────────────────────
export type {
  EsewaConfig,
  EsewaEnvironment,
  PaymentRequest,
  PaymentFormData,
  PaymentInitiationResult,
  EsewaPaymentResponse,
  PaymentVerificationRequest,
  PaymentVerificationResponse,
  EsewaTransactionStatus,
  RefundRequest,
  RefundResponse,
  WebhookPayload,
  WebhookVerificationResult,
  EsewaErrorOptions,
  HttpMethod,
  HttpRequestOptions,
  LogLevel,
} from './types/index.js';

export { EsewaErrorCode } from './types/index.js';

// ─── Error Classes ──────────────────────────────────────────
export {
  EsewaError,
  ValidationError,
  SignatureError,
  NetworkError,
  ConfigurationError,
} from './errors.js';

// ─── Standalone Utilities ───────────────────────────────────
// These are exported for advanced use cases where the full client
// is not needed (e.g., tree-shaking in serverless functions).
export {
  generateSignature,
  generatePaymentSignature,
  verifySignature,
  generateTransactionUuid,
  signPayload,
  buildSignatureMessage,
} from './utils/crypto.js';

export {
  calculateTotalAmount,
  getPaymentUrl,
  getStatusUrl,
  getEnvironmentBaseUrl,
  decodeBase64Json,
  encodeBase64Json,
  maskSensitiveData,
} from './utils/helpers.js';

export {
  validateConfig,
  validatePaymentRequest,
  validateVerificationRequest,
  validateUrl,
  validateBase64,
  validateAmount,
  sanitizeString,
} from './utils/validator.js';

// ─── Module-level Functions ─────────────────────────────────
// Re-export module functions for direct usage without client instantiation
export { createPayment, generatePaymentForm } from './payment.js';
export { decodeResponse, verifyPayment, generateVerificationSignature } from './verification.js';
export { verifyWebhookSignature, processWebhookBody } from './webhook.js';
export { createConfig, getConfigFromEnv } from './config.js';
