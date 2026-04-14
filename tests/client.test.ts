import { describe, it, expect } from 'vitest';
import { EsewaClient, ValidationError, EsewaError } from '../src';

describe('EsewaClient', () => {
  const validConfig = {
    merchantId: 'EPAYTEST',
    secretKey: '8gBm/:&EnhH.1/q',
    environment: 'sandbox' as const,
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  };

  describe('constructor', () => {
    it('should create a client with valid config', () => {
      const client = new EsewaClient(validConfig);
      expect(client).toBeInstanceOf(EsewaClient);
    });

    it('should throw ValidationError for invalid config', () => {
      expect(() => new EsewaClient({ ...validConfig, merchantId: '' })).toThrow(ValidationError);
    });

    it('should throw for missing secretKey', () => {
      expect(() => new EsewaClient({ ...validConfig, secretKey: '' })).toThrow(ValidationError);
    });

    it('should throw for invalid environment', () => {
      expect(
        () =>
          new EsewaClient({
            ...validConfig,
            environment: 'invalid' as unknown as 'sandbox' | 'production',
          })
      ).toThrow(ValidationError);
    });
  });

  describe('createPayment', () => {
    const client = new EsewaClient(validConfig);

    it('should create a payment with valid options', () => {
      const result = client.createPayment({
        amount: 100,
        taxAmount: 10,
        transactionUuid: '241028',
        productCode: 'EPAYTEST',
      });

      expect(result.url).toBe('https://rc-epay.esewa.com.np/api/epay/main/v2/form');
      expect(result.formData.amount).toBe('100');
      expect(result.formData.total_amount).toBe('110');
      expect(result.formData.signature).toBeDefined();
    });

    it('should throw for negative amount', () => {
      expect(() =>
        client.createPayment({
          amount: -100,
          transactionUuid: 'test',
          productCode: 'EPAYTEST',
        })
      ).toThrow(ValidationError);
    });
  });

  describe('generatePaymentForm', () => {
    const client = new EsewaClient(validConfig);

    it('should generate an HTML form', () => {
      const html = client.generatePaymentForm({
        amount: 100,
        transactionUuid: '241028',
        productCode: 'EPAYTEST',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('esewa-payment-form');
    });
  });

  describe('decodeResponse', () => {
    const client = new EsewaClient(validConfig);

    it('should throw for invalid encoded data', () => {
      expect(() => client.decodeResponse('invalid!!!')).toThrow();
    });
  });

  describe('generateTransactionUuid', () => {
    const client = new EsewaClient(validConfig);

    it('should generate a valid UUID', () => {
      const uuid = client.generateTransactionUuid();
      expect(uuid).toMatch(/^\d{6}-[a-f0-9]{12}$/);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = client.generateTransactionUuid();
      const uuid2 = client.generateTransactionUuid();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('calculateTotalAmount', () => {
    const client = new EsewaClient(validConfig);

    it('should calculate total amount correctly', () => {
      const total = client.calculateTotalAmount({
        amount: 1000,
        taxAmount: 130,
        serviceCharge: 50,
        deliveryCharge: 100,
        transactionUuid: 'test',
        productCode: 'EPAYTEST',
      });

      expect(total).toBe(1280);
    });
  });

  describe('signPayload', () => {
    const client = new EsewaClient(validConfig);

    it('should sign a payload and return signature with field names', () => {
      const result = client.signPayload({ amount: 100, code: 'TEST' });

      expect(result.signature).toBeDefined();
      expect(result.signedFieldNames).toBe('amount,code');
    });
  });

  describe('verifySignature', () => {
    const client = new EsewaClient(validConfig);

    it('should verify a valid signature', () => {
      const payload = {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const signature = 'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=';
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';

      expect(client.verifySignature(payload, signature, signedFieldNames)).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const payload = {
        total_amount: '110',
        transaction_uuid: '241028',
        product_code: 'EPAYTEST',
      };
      const signedFieldNames = 'total_amount,transaction_uuid,product_code';

      expect(client.verifySignature(payload, 'bad-sig==', signedFieldNames)).toBe(false);
    });
  });

  describe('getEnvironmentBaseUrl', () => {
    it('should return sandbox URLs', () => {
      const client = new EsewaClient(validConfig);
      const urls = client.getEnvironmentBaseUrl();

      expect(urls.payment).toContain('rc-epay.esewa.com.np');
      expect(urls.status).toContain('rc.esewa.com.np');
    });

    it('should return production URLs for production config', () => {
      const client = new EsewaClient({
        ...validConfig,
        environment: 'production',
      });
      const urls = client.getEnvironmentBaseUrl();

      expect(urls.payment).toContain('epay.esewa.com.np');
      expect(urls.status).not.toContain('rc.');
    });
  });

  describe('getEnvironment', () => {
    it('should return the configured environment', () => {
      const client = new EsewaClient(validConfig);
      expect(client.getEnvironment()).toBe('sandbox');
    });
  });

  describe('getMerchantId', () => {
    it('should return the configured merchant ID', () => {
      const client = new EsewaClient(validConfig);
      expect(client.getMerchantId()).toBe('EPAYTEST');
    });
  });

  describe('Error classes', () => {
    it('EsewaError should be instanceof Error', () => {
      const error = new EsewaError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EsewaError);
    });

    it('ValidationError should be instanceof EsewaError', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(EsewaError);
      expect(error.name).toBe('ValidationError');
    });

    it('EsewaError.toJSON should not contain sensitive data', () => {
      const error = new EsewaError('test message', {
        details: { secretKey: 'hidden' },
      });
      const json = error.toJSON();

      expect(json.name).toBe('EsewaError');
      expect(json.message).toBe('test message');
      expect(json).not.toHaveProperty('stack');
    });
  });
});
