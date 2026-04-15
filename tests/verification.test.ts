import { describe, it, expect, vi } from 'vitest';
import { decodeResponse, generateVerificationSignature, verifyPayment } from '../src/verification';
import { createConfig } from '../src/config';
import { generateSignature } from '../src/utils/crypto';
import { encodeBase64Json } from '../src/utils/helpers';
import { SignatureError, ValidationError } from '../src/errors';

describe('Verification Module', () => {
  const secretKey = '8gBm/:&EnhH.1/q';
  const config = createConfig({
    merchantId: 'EPAYTEST',
    secretKey,
    environment: 'sandbox',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  });

  describe('decodeResponse', () => {
    it('should decode and verify a valid Base64-encoded response', () => {
      // Create a valid response payload
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000.0,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };

      // Generate a valid signature
      const message = signedFieldNames
        .split(',')
        .map((f) => `${f}=${payload[f as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, secretKey);

      // Encode as Base64
      const encoded = encodeBase64Json({ ...payload, signature });

      const result = decodeResponse(config, encoded);

      expect(result.status).toBe('COMPLETE');
      expect(result.transaction_code).toBe('000AWEO');
      expect(result.total_amount).toBe(1000.0);
      expect(result.transaction_uuid).toBe('250610-162413');
      expect(result.product_code).toBe('EPAYTEST');
    });

    it('should throw SignatureError for tampered data', () => {
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000.0,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };

      // Generate signature for original data
      const message = signedFieldNames
        .split(',')
        .map((f) => `${f}=${payload[f as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, secretKey);

      // Tamper with the amount
      const tampered = { ...payload, total_amount: 9999.0, signature };
      const encoded = encodeBase64Json(tampered);

      expect(() => decodeResponse(config, encoded)).toThrow(SignatureError);
    });

    it('should throw ValidationError for invalid Base64', () => {
      expect(() => decodeResponse(config, '!!!not-base64!!!')).toThrow(ValidationError);
    });

    it('should throw ValidationError for empty encoded data', () => {
      expect(() => decodeResponse(config, '')).toThrow(ValidationError);
    });

    it('should throw ValidationError for valid Base64 but invalid JSON', () => {
      const encoded = Buffer.from('not json').toString('base64');
      expect(() => decodeResponse(config, encoded)).toThrow(ValidationError);
    });

    it('should throw ValidationError if signed_field_names is missing', () => {
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000.0,
        signature: 'fakesig==',
      };
      const encoded = encodeBase64Json(payload);

      expect(() => decodeResponse(config, encoded)).toThrow(ValidationError);
    });

    it('should throw ValidationError if a signed field is missing in payload', () => {
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000.0,
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };

      const message = signedFieldNames
        .split(',')
        .map((f) => `${f}=${payload[f as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, secretKey);
      const encoded = encodeBase64Json({ ...payload, signature });

      expect(() => decodeResponse(config, encoded)).toThrow('Signed field');
    });
  });

  describe('verifyPayment', () => {
    it('should verify payment and call status API with query params', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          transaction_code: '000AWEO',
          status: 'COMPLETE',
          total_amount: 1000,
          transaction_uuid: '250610-162413',
          product_code: 'EPAYTEST',
        }),
      } as Response);

      const result = await verifyPayment(config, {
        transactionUuid: '250610-162413',
        totalAmount: 1000,
        productCode: 'EPAYTEST',
      });

      expect(result.status).toBe('COMPLETE');
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('transaction_uuid=250610-162413');
      expect(url).toContain('total_amount=1000');
      expect(url).toContain('product_code=EPAYTEST');
      fetchSpy.mockRestore();
    });

    it('should reject invalid verification request input', async () => {
      await expect(
        verifyPayment(config, {
          transactionUuid: '',
          totalAmount: 1000,
          productCode: 'EPAYTEST',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('generateVerificationSignature', () => {
    it('should generate deterministic signature from provided fields', () => {
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';
      const fields = {
        total_amount: 110,
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };

      const signature = generateVerificationSignature(config, fields, signedFieldNames);

      expect(signature).toBe('i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=');
    });
  });
});
