import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  validatePaymentRequest,
  validateVerificationRequest,
  validateUrl,
  validateBase64,
  validateAmount,
  sanitizeString,
} from '../src/utils/validator';
import type { EsewaConfig, PaymentRequest, PaymentVerificationRequest } from '../src/types';

describe('Validator Utilities', () => {
  const validConfig: EsewaConfig = {
    merchantId: 'TEST_MERCHANT',
    secretKey: 'test-secret-key',
    environment: 'sandbox',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  };

  describe('validateConfig', () => {
    it('should accept a valid configuration', () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw if merchantId is missing', () => {
      expect(() => validateConfig({ ...validConfig, merchantId: '' })).toThrow('merchantId');
    });

    it('should throw if secretKey is missing', () => {
      expect(() => validateConfig({ ...validConfig, secretKey: '' })).toThrow('secretKey');
    });

    it('should throw if environment is invalid', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          environment: 'invalid' as unknown as 'sandbox' | 'production',
        })
      ).toThrow('environment');
    });

    it('should throw if successUrl is missing', () => {
      expect(() => validateConfig({ ...validConfig, successUrl: '' })).toThrow('successUrl');
    });

    it('should throw if failureUrl is missing', () => {
      expect(() => validateConfig({ ...validConfig, failureUrl: '' })).toThrow('failureUrl');
    });

    it('should throw if successUrl is not HTTPS in production', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          environment: 'production',
          successUrl: 'http://example.com/success',
        })
      ).toThrow('HTTPS');
    });

    it('should throw if failureUrl is not HTTPS in production', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          environment: 'production',
          failureUrl: 'http://example.com/failure',
        })
      ).toThrow('HTTPS');
    });

    it('should allow HTTP URLs in sandbox', () => {
      expect(() =>
        validateConfig({
          ...validConfig,
          environment: 'sandbox',
          successUrl: 'http://localhost:3000/success',
          failureUrl: 'http://localhost:3000/failure',
        })
      ).not.toThrow();
    });

    it('should throw if maxRetries is negative', () => {
      expect(() => validateConfig({ ...validConfig, maxRetries: -1 })).toThrow('maxRetries');
    });

    it('should throw if maxRetries exceeds 10', () => {
      expect(() => validateConfig({ ...validConfig, maxRetries: 11 })).toThrow('maxRetries');
    });

    it('should throw if config is null', () => {
      expect(() => validateConfig(null as unknown as EsewaConfig)).toThrow('Configuration');
    });
  });

  describe('validatePaymentRequest', () => {
    const validRequest: PaymentRequest = {
      amount: 1000,
      transactionUuid: '241028-abc123',
      productCode: 'EPAYTEST',
    };

    it('should accept a valid payment request', () => {
      expect(() => validatePaymentRequest(validRequest)).not.toThrow();
    });

    it('should accept a complete payment request with all optional fields', () => {
      expect(() =>
        validatePaymentRequest({
          ...validRequest,
          taxAmount: 100,
          serviceCharge: 50,
          deliveryCharge: 25,
        })
      ).not.toThrow();
    });

    it('should throw if amount is zero', () => {
      expect(() => validatePaymentRequest({ ...validRequest, amount: 0 })).toThrow('amount');
    });

    it('should throw if amount is negative', () => {
      expect(() => validatePaymentRequest({ ...validRequest, amount: -100 })).toThrow('amount');
    });

    it('should throw if amount is not a number', () => {
      expect(() =>
        validatePaymentRequest({ ...validRequest, amount: 'abc' as unknown as number })
      ).toThrow('amount');
    });

    it('should throw if amount is Infinity', () => {
      expect(() => validatePaymentRequest({ ...validRequest, amount: Infinity })).toThrow('finite');
    });

    it('should throw if taxAmount is negative', () => {
      expect(() => validatePaymentRequest({ ...validRequest, taxAmount: -10 })).toThrow(
        'taxAmount'
      );
    });

    it('should throw if transactionUuid is missing', () => {
      expect(() => validatePaymentRequest({ ...validRequest, transactionUuid: '' })).toThrow(
        'transactionUuid'
      );
    });

    it('should throw if transactionUuid has special characters', () => {
      expect(() => validatePaymentRequest({ ...validRequest, transactionUuid: 'abc@#$' })).toThrow(
        'alphanumeric'
      );
    });

    it('should throw if transactionUuid exceeds 100 characters', () => {
      expect(() =>
        validatePaymentRequest({ ...validRequest, transactionUuid: 'a'.repeat(101) })
      ).toThrow('100');
    });

    it('should throw if productCode is missing', () => {
      expect(() => validatePaymentRequest({ ...validRequest, productCode: '' })).toThrow(
        'productCode'
      );
    });

    it('should throw if request is null', () => {
      expect(() => validatePaymentRequest(null as unknown as PaymentRequest)).toThrow(
        'Payment request'
      );
    });
  });

  describe('validateVerificationRequest', () => {
    const validRequest: PaymentVerificationRequest = {
      transactionUuid: '241028-abc123',
      totalAmount: 1000,
      productCode: 'EPAYTEST',
    };

    it('should accept a valid verification request', () => {
      expect(() => validateVerificationRequest(validRequest)).not.toThrow();
    });

    it('should throw if transactionUuid is missing', () => {
      expect(() => validateVerificationRequest({ ...validRequest, transactionUuid: '' })).toThrow(
        'transactionUuid'
      );
    });

    it('should throw if totalAmount is zero', () => {
      expect(() => validateVerificationRequest({ ...validRequest, totalAmount: 0 })).toThrow(
        'totalAmount'
      );
    });

    it('should throw if totalAmount is negative', () => {
      expect(() => validateVerificationRequest({ ...validRequest, totalAmount: -100 })).toThrow(
        'totalAmount'
      );
    });

    it('should throw if productCode is missing', () => {
      expect(() => validateVerificationRequest({ ...validRequest, productCode: '' })).toThrow(
        'productCode'
      );
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(() => validateUrl('https://example.com/path', 'url')).not.toThrow();
    });

    it('should accept valid HTTP URLs', () => {
      expect(() => validateUrl('http://localhost:3000', 'url')).not.toThrow();
    });

    it('should throw for invalid URLs', () => {
      expect(() => validateUrl('not-a-url', 'url')).toThrow('not a valid URL');
    });

    it('should throw for FTP URLs', () => {
      expect(() => validateUrl('ftp://example.com', 'url')).toThrow('HTTP or HTTPS');
    });
  });

  describe('validateBase64', () => {
    it('should accept valid Base64 strings', () => {
      expect(() => validateBase64('aGVsbG8=', 'data')).not.toThrow();
    });

    it('should throw for empty strings', () => {
      expect(() => validateBase64('', 'data')).toThrow('required');
    });

    it('should throw for invalid Base64', () => {
      expect(() => validateBase64('not base64!!!', 'data')).toThrow('Base64');
    });
  });

  describe('validateAmount', () => {
    it('should accept valid amounts', () => {
      expect(() => validateAmount(100, 'amount')).not.toThrow();
      expect(() => validateAmount(99.99, 'amount')).not.toThrow();
      expect(() => validateAmount(0, 'amount')).not.toThrow();
    });

    it('should throw for negative amounts', () => {
      expect(() => validateAmount(-1, 'amount')).toThrow('negative');
    });

    it('should throw for more than 2 decimal places', () => {
      expect(() => validateAmount(99.999, 'amount')).toThrow('decimal');
    });

    it('should throw for Infinity', () => {
      expect(() => validateAmount(Infinity, 'amount')).toThrow('finite');
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00world')).toBe('helloworld');
    });

    it('should preserve normal text', () => {
      expect(sanitizeString('Hello World 123-test')).toBe('Hello World 123-test');
    });
  });
});
