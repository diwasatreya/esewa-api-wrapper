/**
 * @module types
 * @description Core type definitions for the eSewa API Wrapper.
 * All interfaces and types used across the package are defined here.
 */

// ─────────────────────────────────────────────────────────────
// Environment & Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Supported eSewa environments.
 * - `sandbox` — UAT/testing environment (rc-epay.esewa.com.np)
 * - `production` — Live production environment (epay.esewa.com.np)
 */
export type EsewaEnvironment = 'sandbox' | 'production';

/**
 * Configuration options for the eSewa client.
 *
 * @example
 * ```typescript
 * const config: EsewaConfig = {
 *   merchantId: 'YOUR_MERCHANT_ID',
 *   secretKey: process.env.ESEWA_SECRET_KEY!,
 *   environment: 'sandbox',
 *   successUrl: 'https://yourdomain.com/payment/success',
 *   failureUrl: 'https://yourdomain.com/payment/failure',
 * };
 * ```
 */
export interface EsewaConfig {
  /** Merchant ID / Product Code provided by eSewa. */
  merchantId: string;

  /** Secret key for HMAC signature generation. Never expose this publicly. */
  secretKey: string;

  /** Target environment — `'sandbox'` for testing, `'production'` for live. */
  environment: EsewaEnvironment;

  /** URL to redirect the user to after successful payment. Must be HTTPS in production. */
  successUrl: string;

  /** URL to redirect the user to after failed/cancelled payment. Must be HTTPS in production. */
  failureUrl: string;

  /** Enable debug logging (sensitive data will be masked). Defaults to `false`. */
  enableLogging?: boolean;

  /** Maximum number of retry attempts for transient network failures. Defaults to `3`. */
  maxRetries?: number;

  /** Base delay in milliseconds between retries (exponential backoff). Defaults to `1000`. */
  retryDelay?: number;

  /** Request timeout in milliseconds. Defaults to `30000` (30 seconds). */
  timeout?: number;
}

// ─────────────────────────────────────────────────────────────
// Payment Request & Response
// ─────────────────────────────────────────────────────────────

/**
 * Parameters for initiating a payment request.
 *
 * @example
 * ```typescript
 * const payment: PaymentRequest = {
 *   amount: 1000,
 *   taxAmount: 130,
 *   transactionUuid: '241028-unique-id',
 *   productCode: 'EPAYTEST',
 * };
 * ```
 */
export interface PaymentRequest {
  /** The base price amount (excluding tax, service charge, and delivery charge). */
  amount: number;

  /** Tax amount applied to the transaction. Defaults to `0`. */
  taxAmount?: number;

  /** Service charge for the product/service. Defaults to `0`. */
  serviceCharge?: number;

  /** Delivery charge for the product/service. Defaults to `0`. */
  deliveryCharge?: number;

  /**
   * Unique identifier for the transaction.
   * Must contain only alphanumeric characters and hyphens.
   * Use `generateTransactionUuid()` utility to generate one.
   */
  transactionUuid: string;

  /**
   * Product code assigned by eSewa.
   * Use `'EPAYTEST'` for sandbox testing.
   */
  productCode: string;
}

/**
 * The result of creating a payment — contains the URL and form data
 * needed to redirect the user to eSewa's payment page.
 */
export interface PaymentInitiationResult {
  /** The full eSewa payment form action URL. */
  url: string;

  /** The form data to be submitted via POST to the eSewa payment URL. */
  formData: PaymentFormData;
}

/**
 * Form data fields sent to eSewa's payment endpoint via POST.
 * These correspond to the exact parameter names expected by the eSewa v2 API.
 */
export interface PaymentFormData {
  amount: string;
  tax_amount: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: string;
  product_delivery_charge: string;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
  signature: string;
}

/**
 * Decoded response from eSewa after payment completion.
 * Received as a Base64-encoded JSON string in the redirect URL query parameter `data`.
 */
export interface EsewaPaymentResponse {
  /** eSewa-generated transaction code (reference). */
  transaction_code: string;

  /** Transaction status from eSewa. */
  status: EsewaTransactionStatus;

  /** The total amount of the transaction. */
  total_amount: number;

  /** The unique transaction identifier sent in the original request. */
  transaction_uuid: string;

  /** The product code sent in the original request. */
  product_code: string;

  /** Comma-separated list of field names used to generate the signature. */
  signed_field_names: string;

  /** HMAC-SHA256 signature for response verification. */
  signature: string;
}

// ─────────────────────────────────────────────────────────────
// Payment Verification
// ─────────────────────────────────────────────────────────────

/**
 * Parameters for verifying a payment transaction with eSewa's status check API.
 */
export interface PaymentVerificationRequest {
  /** The unique transaction identifier. */
  transactionUuid: string;

  /** The total amount of the transaction to verify. */
  totalAmount: number;

  /** The product code used during payment initiation. */
  productCode: string;
}

/**
 * Response from eSewa's transaction status check API.
 */
export interface PaymentVerificationResponse {
  /** The product code. */
  product_code: string;

  /** The unique transaction identifier. */
  transaction_uuid: string;

  /** The total transaction amount. */
  total_amount: number;

  /** Current status of the transaction. */
  status: EsewaTransactionStatus;

  /** eSewa reference ID (null if transaction not found or pending). */
  ref_id: string | null;
}

/**
 * Possible transaction statuses returned by eSewa.
 */
export type EsewaTransactionStatus =
  | 'COMPLETE'
  | 'PENDING'
  | 'FULL_REFUND'
  | 'PARTIAL_REFUND'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'CANCELED';

// ─────────────────────────────────────────────────────────────
// Refund
// ─────────────────────────────────────────────────────────────

/**
 * Parameters for initiating a refund request.
 */
export interface RefundRequest {
  /** The unique transaction identifier of the original payment. */
  transactionUuid: string;

  /** The amount to refund. */
  amount: number;

  /** The product code used during the original payment. */
  productCode: string;

  /** Optional reason for the refund. */
  reason?: string;
}

/**
 * Response from a refund request.
 */
export interface RefundResponse {
  /** Whether the refund was successfully initiated. */
  success: boolean;

  /** The current status after refund. */
  status: EsewaTransactionStatus;

  /** Message from the API. */
  message: string;
}

// ─────────────────────────────────────────────────────────────
// Webhook
// ─────────────────────────────────────────────────────────────

/**
 * Payload received in a webhook notification from eSewa.
 */
export interface WebhookPayload {
  /** The transaction code. */
  transaction_code: string;

  /** The transaction status. */
  status: EsewaTransactionStatus;

  /** The total amount of the transaction. */
  total_amount: number;

  /** The unique transaction identifier. */
  transaction_uuid: string;

  /** The product code. */
  product_code: string;

  /** Comma-separated signed field names. */
  signed_field_names: string;

  /** HMAC-SHA256 signature for verification. */
  signature: string;

  /** Additional fields that may be present. */
  [key: string]: unknown;
}

/**
 * Result of webhook signature verification.
 */
export interface WebhookVerificationResult {
  /** Whether the webhook signature is valid. */
  isValid: boolean;

  /** The decoded and verified payload (null if verification failed). */
  payload: WebhookPayload | null;

  /** Error message if verification failed. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────

/**
 * Error codes used throughout the package.
 */
export enum EsewaErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SIGNATURE_ERROR = 'SIGNATURE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  RESPONSE_ERROR = 'RESPONSE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Options for creating an eSewa error.
 */
export interface EsewaErrorOptions {
  /** Machine-readable error code. */
  code: EsewaErrorCode;

  /** Human-readable error message. */
  message: string;

  /** The original error that caused this error, if any. */
  cause?: Error;

  /** Additional context or details about the error. */
  details?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Internal / Utility Types
// ─────────────────────────────────────────────────────────────

/**
 * HTTP methods supported for API requests.
 */
export type HttpMethod = 'GET' | 'POST';

/**
 * Options for making an HTTP request.
 */
export interface HttpRequestOptions {
  /** The full URL to request. */
  url: string;

  /** HTTP method. */
  method: HttpMethod;

  /** Request headers. */
  headers?: Record<string, string>;

  /** Request body (for POST requests). */
  body?: Record<string, unknown> | string;

  /** Request timeout in milliseconds. */
  timeout?: number;

  /** Number of retry attempts remaining. */
  retries?: number;

  /** Base delay between retries in milliseconds. */
  retryDelay?: number;
}

/**
 * Log levels for the debug logger.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
