import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature, processWebhookBody } from '../src/webhook';
import { createConfig } from '../src/config';
import { generateSignature } from '../src/utils/crypto';
import { encodeBase64Json } from '../src/utils/helpers';
import type { WebhookPayload } from '../src/types';

describe('Webhook Module', () => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const config = createConfig({
    merchantId: 'EPAYTEST',
    secretKey,
    environment: 'sandbox',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  });

  const createValidPayload = (): WebhookPayload => {
    const signedFieldNames =
      'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
    const fields = {
      transaction_code: '000AWEO',
      status: 'COMPLETE',
      total_amount: 1000,
      transaction_uuid: '250610-162413',
      product_code: 'EPAYTEST',
      signed_field_names: signedFieldNames,
    } as const;

    const payloadWithoutSignature: Pick<
      WebhookPayload,
      | 'transaction_code'
      | 'status'
      | 'total_amount'
      | 'transaction_uuid'
      | 'product_code'
      | 'signed_field_names'
    > = {
      ...fields,
    };

    const message = signedFieldNames
      .split(',')
      .map((f) => `${f}=${payloadWithoutSignature[f as keyof typeof payloadWithoutSignature]}`)
      .join(',');
    const signature = generateSignature(message, secretKey);

    return { ...payloadWithoutSignature, signature };
  };

  describe('verifyWebhookSignature', () => {
    it('should verify a valid webhook payload object', () => {
      const payload = createValidPayload();
      const result = verifyWebhookSignature(config, payload);

      expect(result.isValid).toBe(true);
      expect(result.payload).not.toBeNull();
      expect(result.payload?.status).toBe('COMPLETE');
    });

    it('should verify a valid JSON string payload', () => {
      const payload = createValidPayload();
      const result = verifyWebhookSignature(config, JSON.stringify(payload));

      expect(result.isValid).toBe(true);
    });

    it('should verify a valid Base64-encoded payload', () => {
      const payload = createValidPayload();
      const encoded = encodeBase64Json(payload);
      const result = verifyWebhookSignature(config, encoded);

      expect(result.isValid).toBe(true);
    });

    it('should use external signature when provided', () => {
      const payload = createValidPayload();
      const externalSig = payload.signature;
      const result = verifyWebhookSignature(config, payload, externalSig);

      expect(result.isValid).toBe(true);
    });

    it('should reject a payload with invalid signature', () => {
      const payload = createValidPayload();
      payload.signature = 'invalidSignature==';
      const result = verifyWebhookSignature(config, payload);

      expect(result.isValid).toBe(false);
      expect(result.payload).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should reject a tampered payload', () => {
      const payload = createValidPayload();
      payload.total_amount = 9999; // Tampered
      const result = verifyWebhookSignature(config, payload);

      expect(result.isValid).toBe(false);
    });

    it('should return error for unparseable string', () => {
      const result = verifyWebhookSignature(config, '!!!not-json-or-base64!!!');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    it('should return error when no signature is available', () => {
      const payload = createValidPayload();
      const noSig: Partial<WebhookPayload> = { ...payload };
      delete noSig.signature;
      const result = verifyWebhookSignature(config, noSig as unknown as WebhookPayload);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No signature');
    });

    it('should return error when signed_field_names is missing', () => {
      const payload = createValidPayload();
      const noFields: Partial<WebhookPayload> = { ...payload };
      delete noFields.signed_field_names;
      const result = verifyWebhookSignature(config, noFields as unknown as WebhookPayload);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('signed_field_names');
    });
  });

  describe('processWebhookBody', () => {
    it('should process a raw string body', () => {
      const payload = createValidPayload();
      const result = processWebhookBody(config, JSON.stringify(payload));

      expect(result.isValid).toBe(true);
    });

    it('should process a Buffer body', () => {
      const payload = createValidPayload();
      const buffer = Buffer.from(JSON.stringify(payload), 'utf-8');
      const result = processWebhookBody(config, buffer);

      expect(result.isValid).toBe(true);
    });

    it('should accept external signature header', () => {
      const payload = createValidPayload();
      const sig = payload.signature;
      const result = processWebhookBody(config, JSON.stringify(payload), sig);

      expect(result.isValid).toBe(true);
    });
  });
});
