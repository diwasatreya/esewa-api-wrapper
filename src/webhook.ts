/**
 * @module webhook
 * @description Webhook handling module for the eSewa API Wrapper.
 * Provides utilities for verifying webhook signatures and processing
 * incoming webhook notifications from eSewa.
 */

import type { EsewaConfig, WebhookPayload, WebhookVerificationResult } from './types';
import { verifySignature } from './utils/crypto';
import { decodeBase64Json } from './utils/helpers';

/**
 * Verifies the signature of an incoming webhook notification from eSewa.
 *
 * Webhook notifications should always be verified before processing to
 * ensure they are legitimate and have not been tampered with.
 *
 * @param config - The eSewa client configuration (contains the secretKey for verification)
 * @param payload - The webhook payload (can be a parsed object or a raw JSON string)
 * @param signature - The signature sent with the webhook (usually in a header)
 * @returns A verification result indicating whether the webhook is legitimate
 *
 * @example
 * ```typescript
 * // Express.js webhook handler
 * app.post('/webhook/esewa', (req, res) => {
 *   const result = verifyWebhookSignature(
 *     config,
 *     req.body,
 *     req.headers['x-esewa-signature'] as string
 *   );
 *
 *   if (result.isValid) {
 *     // Process the verified webhook payload
 *     handlePaymentUpdate(result.payload);
 *     res.json({ received: true });
 *   } else {
 *     console.error('Invalid webhook:', result.error);
 *     res.status(403).json({ error: 'Invalid signature' });
 *   }
 * });
 * ```
 */
export function verifyWebhookSignature(
  config: Readonly<Required<EsewaConfig>>,
  payload: WebhookPayload | string,
  signature?: string
): WebhookVerificationResult {
  try {
    // Parse the payload if it's a string
    let parsedPayload: WebhookPayload;

    if (typeof payload === 'string') {
      try {
        parsedPayload = JSON.parse(payload) as WebhookPayload;
      } catch {
        // Try Base64 decoding if JSON parsing fails
        try {
          parsedPayload = decodeBase64Json<WebhookPayload>(payload);
        } catch {
          return {
            isValid: false,
            payload: null,
            error: 'Failed to parse webhook payload: not valid JSON or Base64',
          };
        }
      }
    } else {
      parsedPayload = payload;
    }

    // Determine the signature to verify against
    const sigToVerify = signature ?? parsedPayload.signature;

    if (!sigToVerify) {
      return {
        isValid: false,
        payload: null,
        error: 'No signature provided for verification',
      };
    }

    // Validate that signed_field_names is present
    if (!parsedPayload.signed_field_names) {
      return {
        isValid: false,
        payload: null,
        error: 'Webhook payload missing signed_field_names',
      };
    }

    // Build the payload fields for signature verification
    const fields: Record<string, string | number> = {};
    const fieldNames = parsedPayload.signed_field_names.split(',').map((f) => f.trim());

    for (const fieldName of fieldNames) {
      const value = parsedPayload[fieldName as keyof WebhookPayload];
      if (value === undefined || value === null) {
        return {
          isValid: false,
          payload: null,
          error: `Signed field "${fieldName}" is missing from webhook payload`,
        };
      }
      fields[fieldName] = value as string | number;
    }

    // Verify the signature using timing-safe comparison
    const isValid = verifySignature(
      fields,
      sigToVerify,
      parsedPayload.signed_field_names,
      config.secretKey
    );

    if (isValid) {
      return {
        isValid: true,
        payload: parsedPayload,
      };
    }

    return {
      isValid: false,
      payload: null,
      error: 'Webhook signature verification failed — possible tampering detected',
    };
  } catch (error) {
    return {
      isValid: false,
      payload: null,
      error: `Webhook verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Processes a raw webhook request body (Express/NestJS compatible).
 *
 * This is a convenience method that handles both URL-encoded and JSON
 * webhook payloads, verifies the signature, and returns a typed result.
 *
 * @param config - The eSewa client configuration
 * @param rawBody - The raw request body (string or Buffer)
 * @param signatureHeader - Optional signature from the request header
 * @returns A verification result with the parsed and verified payload
 *
 * @example
 * ```typescript
 * // NestJS controller example
 * @Post('webhook/esewa')
 * handleWebhook(@Body() body: string, @Headers('x-esewa-signature') sig: string) {
 *   const result = processWebhookBody(this.config, body, sig);
 *   if (!result.isValid) throw new ForbiddenException(result.error);
 *   return this.paymentService.handleUpdate(result.payload);
 * }
 * ```
 */
export function processWebhookBody(
  config: Readonly<Required<EsewaConfig>>,
  rawBody: string | Buffer,
  signatureHeader?: string
): WebhookVerificationResult {
  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : rawBody;
  return verifyWebhookSignature(config, bodyString, signatureHeader);
}
