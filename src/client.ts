/**
 * @module client
 * @description The main eSewa client class that provides a unified interface
 * to all eSewa payment operations. This is the primary entry point for
 * developers integrating with the eSewa Payment Gateway.
 */

import type {
  EsewaConfig,
  EsewaPaymentResponse,
  PaymentInitiationResult,
  PaymentRequest,
  PaymentVerificationRequest,
  PaymentVerificationResponse,
  RefundRequest,
  RefundResponse,
  WebhookPayload,
  WebhookVerificationResult,
} from './types';
import { createConfig, getConfigFromEnv } from './config';
import { createPayment, generatePaymentForm } from './payment';
import { decodeResponse, verifyPayment } from './verification';
import { verifyWebhookSignature, processWebhookBody } from './webhook';
import { generateTransactionUuid, signPayload, verifySignature } from './utils/crypto';
import { calculateTotalAmount, createLogger, getEnvironmentBaseUrl } from './utils/helpers';

/**
 * The main eSewa client for integrating with the eSewa Payment Gateway.
 *
 * Provides a secure, type-safe, and developer-friendly interface to:
 * - Initiate payments with HMAC-SHA256 signed requests
 * - Verify payment transactions via the status check API
 * - Decode and validate Base64-encoded eSewa responses
 * - Handle webhook notifications
 * - Generate auto-submitting payment forms for SSR applications
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
 *
 * // Create a payment
 * const payment = esewa.createPayment({
 *   amount: 1000,
 *   taxAmount: 130,
 *   transactionUuid: esewa.generateTransactionUuid(),
 *   productCode: 'EPAYTEST',
 * });
 *
 * // Verify a payment
 * const status = await esewa.verifyPayment({
 *   transactionUuid: '241028-abc123',
 *   totalAmount: 1130,
 *   productCode: 'EPAYTEST',
 * });
 * ```
 */
export class EsewaClient {
  /** @internal Validated and frozen configuration. */
  private readonly config: Readonly<Required<EsewaConfig>>;

  /** @internal Debug logger with sensitive data masking. */
  private readonly log: ReturnType<typeof createLogger>;

  /**
   * Creates a new eSewa client instance.
   *
   * Configuration is validated immediately. If invalid options are provided,
   * a `ValidationError` is thrown synchronously.
   *
   * Missing configuration values can be supplied via environment variables:
   * - `ESEWA_MERCHANT_ID`
   * - `ESEWA_SECRET_KEY`
   * - `ESEWA_ENVIRONMENT`
   * - `ESEWA_SUCCESS_URL`
   * - `ESEWA_FAILURE_URL`
   *
   * @param config - The client configuration options
   * @throws {ValidationError} If the configuration is invalid or incomplete
   */
  constructor(config: EsewaConfig) {
    // Merge with environment variables (explicit config takes precedence)
    const envConfig = getConfigFromEnv();
    const mergedConfig: EsewaConfig = { ...envConfig, ...config };

    this.config = createConfig(mergedConfig);
    this.log = createLogger(this.config.enableLogging);

    this.log('info', `eSewa client initialized for ${this.config.environment} environment`);
  }

  // ─────────────────────────────────────────────────────────────
  // Payment Initiation
  // ─────────────────────────────────────────────────────────────

  /**
   * Creates a payment request and returns the eSewa payment URL with signed form data.
   *
   * The returned object contains:
   * - `url` — The eSewa payment form endpoint URL
   * - `formData` — All form fields (including HMAC-SHA256 signature) to POST
   *
   * You must redirect the user to eSewa using a POST request with the form data.
   *
   * @param options - The payment request options
   * @returns Payment initiation result with URL and signed form data
   * @throws {ValidationError} If the payment options are invalid
   *
   * @example
   * ```typescript
   * const { url, formData } = esewa.createPayment({
   *   amount: 1000,
   *   taxAmount: 0,
   *   serviceCharge: 0,
   *   deliveryCharge: 0,
   *   transactionUuid: 'unique-transaction-id',
   *   productCode: 'EPAYTEST',
   * });
   * ```
   */
  createPayment(options: PaymentRequest): PaymentInitiationResult {
    this.log('info', 'Creating payment', {
      transactionUuid: options.transactionUuid,
      amount: options.amount,
      productCode: options.productCode,
    });

    const result = createPayment(this.config, options);

    this.log('debug', 'Payment created successfully', {
      url: result.url,
      transactionUuid: options.transactionUuid,
    });

    return result;
  }

  /**
   * Generates an auto-submitting HTML form for server-rendered applications.
   *
   * Returns a complete HTML page that automatically submits the payment form
   * to eSewa when loaded in the user's browser. Includes a fallback submit
   * button for browsers with JavaScript disabled.
   *
   * @param options - The payment request options
   * @returns Complete HTML string with auto-submitting form
   * @throws {ValidationError} If the payment options are invalid
   *
   * @example
   * ```typescript
   * // Express.js
   * app.post('/pay', (req, res) => {
   *   const html = esewa.generatePaymentForm({
   *     amount: 1000,
   *     transactionUuid: esewa.generateTransactionUuid(),
   *     productCode: 'EPAYTEST',
   *   });
   *   res.setHeader('Content-Type', 'text/html');
   *   res.send(html);
   * });
   * ```
   */
  generatePaymentForm(options: PaymentRequest): string {
    this.log('info', 'Generating payment form', {
      transactionUuid: options.transactionUuid,
      amount: options.amount,
    });

    return generatePaymentForm(this.config, options);
  }

  // ─────────────────────────────────────────────────────────────
  // Payment Verification
  // ─────────────────────────────────────────────────────────────

  /**
   * Verifies a payment transaction by querying eSewa's status check API.
   *
   * This performs a server-to-server verification request. **Always call this**
   * after receiving a success callback to confirm the transaction is genuine.
   *
   * @param options - Verification request with transactionUuid, totalAmount, and productCode
   * @returns The transaction status response from eSewa
   * @throws {ValidationError} If the request parameters are invalid
   * @throws {NetworkError} If the API request fails after all retries
   *
   * @example
   * ```typescript
   * const result = await esewa.verifyPayment({
   *   transactionUuid: 'unique-transaction-id',
   *   totalAmount: 1000,
   *   productCode: 'EPAYTEST',
   * });
   *
   * if (result.status === 'COMPLETE') {
   *   // Transaction verified — fulfil the order
   * }
   * ```
   */
  async verifyPayment(options: PaymentVerificationRequest): Promise<PaymentVerificationResponse> {
    this.log('info', 'Verifying payment', {
      transactionUuid: options.transactionUuid,
      totalAmount: options.totalAmount,
    });

    const result = await verifyPayment(this.config, options);

    this.log('info', 'Payment verification complete', {
      transactionUuid: options.transactionUuid,
      status: result.status,
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Response Decoding
  // ─────────────────────────────────────────────────────────────

  /**
   * Decodes a Base64-encoded eSewa payment response and validates its signature.
   *
   * After a successful payment, eSewa redirects the user to your success URL
   * with a `data` query parameter containing a Base64-encoded JSON string.
   * This method decodes it and verifies the HMAC-SHA256 signature.
   *
   * @param encodedData - The Base64-encoded response string from the `data` query parameter
   * @returns The decoded and signature-verified payment response
   * @throws {ValidationError} If the encoded data is malformed
   * @throws {SignatureError} If the signature is invalid (possible tampering)
   *
   * @example
   * ```typescript
   * // Next.js API route
   * export default function handler(req, res) {
   *   const response = esewa.decodeResponse(req.query.data);
   *   if (response.status === 'COMPLETE') {
   *     // Update order status in database
   *   }
   * }
   * ```
   */
  decodeResponse(encodedData: string): EsewaPaymentResponse {
    this.log('info', 'Decoding eSewa response');

    const response = decodeResponse(this.config, encodedData);

    this.log('info', 'Response decoded and verified', {
      transactionUuid: response.transaction_uuid,
      status: response.status,
    });

    return response;
  }

  // ─────────────────────────────────────────────────────────────
  // Webhook Handling
  // ─────────────────────────────────────────────────────────────

  /**
   * Verifies the signature of an incoming webhook notification from eSewa.
   *
   * @param payload - The webhook payload (parsed object or raw JSON string)
   * @param signature - Optional external signature (e.g., from a request header)
   * @returns Verification result with the validated payload
   *
   * @example
   * ```typescript
   * const result = esewa.verifyWebhookSignature(req.body, req.headers['x-esewa-signature']);
   * if (result.isValid) {
   *   // Process result.payload
   * }
   * ```
   */
  verifyWebhookSignature(
    payload: WebhookPayload | string,
    signature?: string
  ): WebhookVerificationResult {
    this.log('info', 'Verifying webhook signature');

    const result = verifyWebhookSignature(this.config, payload, signature);

    this.log('info', `Webhook verification: ${result.isValid ? 'valid' : 'invalid'}`);

    return result;
  }

  /**
   * Processes a raw webhook request body (Express/NestJS compatible).
   *
   * @param rawBody - The raw request body (string or Buffer)
   * @param signatureHeader - Optional signature from the request header
   * @returns Verification result with the parsed and verified payload
   */
  processWebhookBody(
    rawBody: string | Buffer,
    signatureHeader?: string
  ): WebhookVerificationResult {
    return processWebhookBody(this.config, rawBody, signatureHeader);
  }

  // ─────────────────────────────────────────────────────────────
  // Refund Handling
  // ─────────────────────────────────────────────────────────────

  /**
   * Initiates a refund request for a previously completed transaction.
   *
   * **Note:** Refund support depends on eSewa's API availability.
   * This method checks the transaction status and returns the current state.
   * Full programmatic refund initiation may require contacting eSewa directly.
   *
   * @param options - The refund request options
   * @returns The refund response with current status
   * @throws {ValidationError} If the request parameters are invalid
   * @throws {NetworkError} If the API request fails
   *
   * @example
   * ```typescript
   * const result = await esewa.initiateRefund({
   *   transactionUuid: '241028-abc123',
   *   amount: 500,
   *   productCode: 'EPAYTEST',
   * });
   * ```
   */
  async initiateRefund(options: RefundRequest): Promise<RefundResponse> {
    this.log('info', 'Initiating refund', {
      transactionUuid: options.transactionUuid,
      amount: options.amount,
    });

    // Verify the transaction exists and get current status
    const status = await this.verifyPayment({
      transactionUuid: options.transactionUuid,
      totalAmount: options.amount,
      productCode: options.productCode,
    });

    if (status.status === 'FULL_REFUND') {
      return {
        success: true,
        status: status.status,
        message: 'Transaction has already been fully refunded',
      };
    }

    if (status.status === 'PARTIAL_REFUND') {
      return {
        success: true,
        status: status.status,
        message: 'Transaction has been partially refunded',
      };
    }

    if (status.status !== 'COMPLETE') {
      return {
        success: false,
        status: status.status,
        message: `Cannot refund transaction with status: ${status.status}`,
      };
    }

    // Note: eSewa's public API does not expose a direct refund endpoint.
    // Refunds are typically processed through eSewa's merchant portal or by contacting support.
    return {
      success: false,
      status: status.status,
      message:
        'Refund request registered. Please contact eSewa support or use the merchant portal ' +
        'to process the refund. Transaction is currently in COMPLETE status.',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Generates a unique transaction UUID suitable for eSewa transactions.
   *
   * Format: `YYMMDD-<12-char-random-hex>`
   * Contains only alphanumeric characters and hyphens (eSewa requirement).
   *
   * @returns A unique transaction UUID string
   *
   * @example
   * ```typescript
   * const uuid = esewa.generateTransactionUuid();
   * // e.g., '241028-a1b2c3d4e5f6'
   * ```
   */
  generateTransactionUuid(): string {
    return generateTransactionUuid();
  }

  /**
   * Calculates the total amount from payment request components.
   *
   * `total = amount + taxAmount + serviceCharge + deliveryCharge`
   *
   * @param request - Payment request with amount components
   * @returns The calculated total amount
   */
  calculateTotalAmount(request: PaymentRequest): number {
    return calculateTotalAmount(request);
  }

  /**
   * Signs an arbitrary payload using HMAC-SHA256 with the configured secret key.
   *
   * @param payload - Key-value pairs to sign
   * @returns Object with `signature` and `signedFieldNames`
   */
  signPayload(payload: Record<string, string | number>): {
    signature: string;
    signedFieldNames: string;
  } {
    return signPayload(payload, this.config.secretKey);
  }

  /**
   * Verifies an HMAC-SHA256 signature against the expected payload.
   *
   * @param payload - The data that was signed
   * @param signature - The signature to verify
   * @param signedFieldNames - The comma-separated list of signed field names
   * @returns `true` if the signature is valid
   */
  verifySignature(
    payload: Record<string, string | number>,
    signature: string,
    signedFieldNames: string
  ): boolean {
    return verifySignature(payload, signature, signedFieldNames, this.config.secretKey);
  }

  /**
   * Returns the API URLs for the configured environment.
   *
   * @returns Object with `payment` and `status` URLs
   */
  getEnvironmentBaseUrl(): { payment: string; status: string } {
    return getEnvironmentBaseUrl(this.config.environment);
  }

  /**
   * Returns the current environment setting.
   *
   * @returns `'sandbox'` or `'production'`
   */
  getEnvironment(): EsewaConfig['environment'] {
    return this.config.environment;
  }

  /**
   * Returns the configured merchant ID.
   *
   * @returns The merchant ID string
   */
  getMerchantId(): string {
    return this.config.merchantId;
  }
}
