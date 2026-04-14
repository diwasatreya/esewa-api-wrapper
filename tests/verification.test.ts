import { describe, it, expect } from 'vitest';
import { decodeResponse } from '../src/verification';
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
  });
});
