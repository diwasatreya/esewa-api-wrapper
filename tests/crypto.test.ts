import { describe, it, expect } from 'vitest';
import {
  generateSignature,
  generatePaymentSignature,
  verifySignature,
  generateTransactionUuid,
  signPayload,
  buildSignatureMessage,
} from '../src/utils/crypto';

describe('Crypto Utilities', () => {
  const secretKey = '8gBm/:&EnhH.1/q';

  describe('generateSignature', () => {
    it('should generate a valid HMAC-SHA256 Base64 signature', () => {
      const message = 'total_amount=110,transaction_uuid=241028,product_code=EPAYTEST';
      const signature = generateSignature(message, secretKey);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      // Base64 pattern
      expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should produce the known eSewa test signature', () => {
      // From the official eSewa documentation:
      // total_amount=110, transaction_uuid=241028, product_code=EPAYTEST, secret=8gBm/:&EnhH.1/q
      const message = 'total_amount=110,transaction_uuid=241028,product_code=EPAYTEST';
      const signature = generateSignature(message, secretKey);

      expect(signature).toBe('i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=');
    });

    it('should produce different signatures for different messages', () => {
      const sig1 = generateSignature('message1', secretKey);
      const sig2 = generateSignature('message2', secretKey);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different keys', () => {
      const sig1 = generateSignature('same-message', 'key1');
      const sig2 = generateSignature('same-message', 'key2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('buildSignatureMessage', () => {
    it('should build a comma-separated key=value string', () => {
      const fields = {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const message = buildSignatureMessage(fields, 'total_amount,transaction_uuid,product_code');

      expect(message).toBe('total_amount=110,transaction_uuid=241028,product_code=EPAYTEST');
    });

    it('should respect the field order from signedFieldNames', () => {
      const fields = {
        product_code: 'EPAYTEST',
        total_amount: '110',
        transaction_uuid: '241028',
      };
      const message = buildSignatureMessage(fields, 'total_amount,transaction_uuid,product_code');

      expect(message).toBe('total_amount=110,transaction_uuid=241028,product_code=EPAYTEST');
    });

    it('should handle numeric values', () => {
      const fields = { total_amount: 110 };
      const message = buildSignatureMessage(fields, 'total_amount');

      expect(message).toBe('total_amount=110');
    });
  });

  describe('generatePaymentSignature', () => {
    it('should generate the correct signature for a payment', () => {
      const signature = generatePaymentSignature(110, '241028', 'EPAYTEST', secretKey);

      expect(signature).toBe('i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=');
    });
  });

  describe('verifySignature', () => {
    it('should return true for a valid signature', () => {
      const payload = {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const signature = 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=';
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';

      const isValid = verifySignature(payload, signature, signedFieldNames, secretKey);
      expect(isValid).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const badSignature = 'invalidSignature==';
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';

      const isValid = verifySignature(payload, badSignature, signedFieldNames, secretKey);
      expect(isValid).toBe(false);
    });

    it('should return false for tampered data', () => {
      const payload = {
        total_amount: '999', // tampered amount
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const signature = 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=';
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';

      const isValid = verifySignature(payload, signature, signedFieldNames, secretKey);
      expect(isValid).toBe(false);
    });
  });

  describe('generateTransactionUuid', () => {
    it('should generate a string in YYMMDD-xxxxxxxxxxxx format', () => {
      const uuid = generateTransactionUuid();

      expect(uuid).toMatch(/^\d{6}-[a-f0-9]{12}$/);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 100 }, () => generateTransactionUuid()));
      expect(uuids.size).toBe(100);
    });

    it('should contain only alphanumeric characters and hyphens', () => {
      const uuid = generateTransactionUuid();
      expect(uuid).toMatch(/^[a-zA-Z0-9-]+$/);
    });
  });

  describe('signPayload', () => {
    it('should return signature and signedFieldNames', () => {
      const payload = { total_amount: 110, transaction_uuid: '241028', product_code: 'EPAYTEST' };
      const result = signPayload(payload, secretKey);

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('signedFieldNames');
      expect(result.signedFieldNames).toBe('total_amount,transaction_uuid,product_code');
      expect(typeof result.signature).toBe('string');
    });
  });
});
