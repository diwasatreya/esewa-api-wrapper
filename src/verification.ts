/**
 * @module verification
 * @description Payment verification module for the eSewa API Wrapper.
 * Handles decoding eSewa's Base64-encoded response, verifying signatures,
 * and querying eSewa's transaction status check API.
 */

import type {
  EsewaConfig,
  EsewaPaymentResponse,
  PaymentVerificationRequest,
  PaymentVerificationResponse,
} from './types';
import { SignatureError, ValidationError } from './errors';
import { buildSignatureMessage, generateSignature, verifySignature } from './utils/crypto';
import { decodeBase64Json, getStatusUrl, makeHttpRequest } from './utils/helpers';
import { validateBase64, validateVerificationRequest } from './utils/validator';

/**
 * Decodes a Base64-encoded eSewa payment response and validates its signature.
 *
 * After a successful payment, eSewa redirects the user to the success URL with
 * a `data` query parameter containing a Base64-encoded JSON string. This method
 * decodes that string and verifies its HMAC-SHA256 signature to ensure the data
 * has not been tampered with.
 *
 * @param config - The eSewa client configuration (contains secretKey for verification)
 * @param encodedData - The Base64-encoded response string from the `data` query parameter
 * @returns The decoded and verified payment response
 * @throws {ValidationError} If the encoded data is invalid
 * @throws {SignatureError} If the signature verification fails (possible tampering)
 *
 * @example
 * ```typescript
 * // Express.js success callback handler
 * app.get('/payment/success', (req, res) => {
 *   try {
 *     const response = decodeResponse(config, req.query.data as string);
 *     if (response.status === 'COMPLETE') {
 *       // Payment successful — update your database
 *     }
 *   } catch (error) {
 *     if (error instanceof SignatureError) {
 *       // Possible tampering — do NOT fulfil the order
 *     }
 *   }
 * });
 * ```
 */
export function decodeResponse(
  config: Readonly<Required<EsewaConfig>>,
  encodedData: string
): EsewaPaymentResponse {
  // Validate the encoded data format
  validateBase64(encodedData, 'encodedData');

  // Decode the Base64 JSON
  let response: EsewaPaymentResponse;
  try {
    response = decodeBase64Json<EsewaPaymentResponse>(encodedData);
  } catch (error) {
    throw new ValidationError('Failed to decode eSewa response: invalid Base64 or JSON format', {
      cause: error instanceof Error ? error : undefined,
    });
  }

  // Validate required fields exist
  if (!response.signed_field_names || !response.signature) {
    throw new ValidationError(
      'Decoded response is missing required fields: signed_field_names, signature'
    );
  }

  // Build the payload object for signature verification
  const payload: Record<string, string | number> = {};
  const fieldNames = response.signed_field_names.split(',').map((f) => f.trim());

  for (const field of fieldNames) {
    const value = response[field as keyof EsewaPaymentResponse];
    if (value === undefined || value === null) {
      throw new ValidationError(`Signed field "${field}" is missing from the response`);
    }
    payload[field] = value as string | number;
  }

  // Verify the HMAC-SHA256 signature
  const isValid = verifySignature(
    payload,
    response.signature,
    response.signed_field_names,
    config.secretKey
  );

  if (!isValid) {
    throw new SignatureError(
      'Response signature verification failed. The response may have been tampered with. ' +
        'Do NOT process this payment.'
    );
  }

  return response;
}

/**
 * Verifies a payment transaction by querying eSewa's status check API.
 *
 * This is the recommended server-to-server verification method. After receiving
 * a success callback, always call this method to confirm the transaction status
 * directly with eSewa before fulfilling the order.
 *
 * Uses automatic retry with exponential backoff for transient network failures.
 *
 * @param config - The eSewa client configuration
 * @param request - The verification request containing transactionUuid, totalAmount, and productCode
 * @returns The transaction status response from eSewa
 * @throws {ValidationError} If the request parameters are invalid
 * @throws {NetworkError} If the API request fails after all retries
 *
 * @example
 * ```typescript
 * const status = await verifyPayment(config, {
 *   transactionUuid: '241028-abc123',
 *   totalAmount: 1130,
 *   productCode: 'EPAYTEST',
 * });
 *
 * if (status.status === 'COMPLETE') {
 *   // Transaction confirmed — fulfil the order
 * } else if (status.status === 'PENDING') {
 *   // Payment still processing — check again later
 * }
 * ```
 */
export async function verifyPayment(
  config: Readonly<Required<EsewaConfig>>,
  request: PaymentVerificationRequest
): Promise<PaymentVerificationResponse> {
  // Validate request parameters
  validateVerificationRequest(request);

  // Build the status check URL with query parameters
  const baseUrl = getStatusUrl(config.environment);
  const queryParams = new URLSearchParams({
    product_code: request.productCode,
    total_amount: String(request.totalAmount),
    transaction_uuid: request.transactionUuid,
  });

  const url = `${baseUrl}?${queryParams.toString()}`;

  // Make the API request with retry logic
  return makeHttpRequest<PaymentVerificationResponse>({
    url,
    method: 'GET',
    timeout: config.timeout,
    retries: config.maxRetries,
    retryDelay: config.retryDelay,
  });
}

/**
 * Generates a verification signature for comparing with eSewa's response.
 *
 * This is useful when you need to manually verify a signature outside of
 * the standard `decodeResponse` flow.
 *
 * @param config - The eSewa client configuration
 * @param fields - The fields to sign
 * @param signedFieldNames - Comma-separated list of field names to include
 * @returns The expected Base64-encoded HMAC-SHA256 signature
 */
export function generateVerificationSignature(
  config: Readonly<Required<EsewaConfig>>,
  fields: Record<string, string | number>,
  signedFieldNames: string
): string {
  const message = buildSignatureMessage(fields, signedFieldNames);
  return generateSignature(message, config.secretKey);
}
