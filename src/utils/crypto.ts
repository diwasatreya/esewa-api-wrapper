/**
 * @module utils/crypto
 * @description Cryptographic utilities for HMAC-SHA256 signature generation
 * and verification. All sensitive operations are performed using Node.js
 * built-in `crypto` module — no third-party dependencies required.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { SignatureError } from '../errors';

/**
 * Generates an HMAC-SHA256 signature and returns it as a Base64-encoded string.
 *
 * The signature is computed over a message string using the merchant's secret key.
 * This follows the eSewa ePay v2 specification: signed fields are concatenated as
 * `key=value` pairs separated by commas.
 *
 * @param message - The message string to sign (e.g., `"total_amount=100,transaction_uuid=abc,product_code=EPAYTEST"`)
 * @param secretKey - The merchant's secret key provided by eSewa
 * @returns Base64-encoded HMAC-SHA256 signature
 *
 * @example
 * ```typescript
 * const signature = generateSignature(
 *   'total_amount=110,transaction_uuid=241028,product_code=EPAYTEST',
 *   '8gBm/:&EnhH.1/q'
 * );
 * // Returns: 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME='
 * ```
 */
export function generateSignature(message: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(message).digest('base64');
}

/**
 * Builds the signature message string from the signed field names and their values.
 *
 * eSewa uses a specific format where signed fields are listed as comma-separated
 * `key=value` pairs. The field names that were signed are themselves included
 * in the `signed_field_names` parameter.
 *
 * @param fields - An object containing all field values
 * @param signedFieldNames - Comma-separated string of field names to include in the signature
 * @returns The constructed message string ready for signing
 *
 * @example
 * ```typescript
 * const message = buildSignatureMessage(
 *   { total_amount: '110', transaction_uuid: '241028', product_code: 'EPAYTEST' },
 *   'total_amount,transaction_uuid,product_code'
 * );
 * // Returns: 'total_amount=110,transaction_uuid=241028,product_code=EPAYTEST'
 * ```
 */
export function buildSignatureMessage(
  fields: Record<string, string | number>,
  signedFieldNames: string
): string {
  const fieldNames = signedFieldNames.split(',').map((f) => f.trim());
  return fieldNames.map((name) => `${name}=${fields[name]}`).join(',');
}

/**
 * Generates the HMAC-SHA256 signature for a payment request.
 *
 * Constructs the message from total_amount, transaction_uuid, and product_code
 * (in that exact order as required by eSewa), then signs it with the secret key.
 *
 * @param totalAmount - The total transaction amount
 * @param transactionUuid - Unique transaction identifier
 * @param productCode - The merchant's product code
 * @param secretKey - The merchant's secret key
 * @returns Base64-encoded HMAC-SHA256 signature
 */
export function generatePaymentSignature(
  totalAmount: number,
  transactionUuid: string,
  productCode: string,
  secretKey: string
): string {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  return generateSignature(message, secretKey);
}

/**
 * Verifies an HMAC-SHA256 signature against expected data.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The data object containing signed fields
 * @param signature - The signature to verify
 * @param signedFieldNames - Comma-separated list of signed field names
 * @param secretKey - The merchant's secret key
 * @returns `true` if the signature is valid, `false` otherwise
 * @throws {SignatureError} If signature verification fails due to malformed input
 */
export function verifySignature(
  payload: Record<string, string | number>,
  signature: string,
  signedFieldNames: string,
  secretKey: string
): boolean {
  try {
    const message = buildSignatureMessage(payload, signedFieldNames);
    const expectedSignature = generateSignature(message, secretKey);

    const sigBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (error) {
    throw new SignatureError(
      `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

/**
 * Generates a cryptographically secure unique transaction UUID.
 *
 * The UUID follows the format `YYMMDD-<random>` which is compatible
 * with eSewa's requirement for alphanumeric characters and hyphens only.
 *
 * @returns A unique transaction UUID string
 *
 * @example
 * ```typescript
 * const uuid = generateTransactionUuid();
 * // Returns something like: '241028-a1b2c3d4e5f6'
 * ```
 */
export function generateTransactionUuid(): string {
  const now = new Date();
  const datePrefix = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  // Use crypto.randomUUID() and take a portion for brevity
  const randomPart = randomUUID().replace(/-/g, '').slice(0, 12);

  return `${datePrefix}-${randomPart}`;
}

/**
 * Signs an arbitrary payload using HMAC-SHA256.
 *
 * This is a general-purpose signing utility that can be used for
 * custom payloads beyond the standard payment flow.
 *
 * @param payload - Key-value pairs to sign
 * @param secretKey - The secret key for signing
 * @returns An object containing the signature and the signed field names
 */
export function signPayload(
  payload: Record<string, string | number>,
  secretKey: string
): { signature: string; signedFieldNames: string } {
  const signedFieldNames = Object.keys(payload).join(',');
  const message = buildSignatureMessage(payload, signedFieldNames);
  const signature = generateSignature(message, secretKey);

  return { signature, signedFieldNames };
}
