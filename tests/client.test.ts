import { describe, it, expect, vi } from 'vitest';
import { EsewaClient, ValidationError, EsewaError } from '../src';
import { generateSignature } from '../src/utils/crypto';
import { encodeBase64Json } from '../src/utils/helpers';

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

    it('should decode a valid response payload', () => {
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };
      const message = signedFieldNames
        .split(',')
        .map((field) => `${field}=${payload[field as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, validConfig.secretKey);
      const encoded = encodeBase64Json({ ...payload, signature });

      const result = client.decodeResponse(encoded);
      expect(result.status).toBe('COMPLETE');
      expect(result.transaction_uuid).toBe('250610-162413');
    });

    it('should throw for invalid encoded data', () => {
      expect(() => client.decodeResponse('invalid!!!')).toThrow();
    });
  });

  describe('verifyPayment', () => {
    it('should verify payment via status API', async () => {
      const client = new EsewaClient(validConfig);
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({
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

      const result = await client.verifyPayment({
        transactionUuid: '250610-162413',
        totalAmount: 1000,
        productCode: 'EPAYTEST',
      });

      expect(result.status).toBe('COMPLETE');
      expect(fetchSpy).toHaveBeenCalledOnce();
      fetchSpy.mockRestore();
    });
  });

  describe('webhook proxy methods', () => {
    it('should verify webhook signature through client method', () => {
      const client = new EsewaClient(validConfig);
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };
      const message = signedFieldNames
        .split(',')
        .map((field) => `${field}=${payload[field as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, validConfig.secretKey);

      const result = client.verifyWebhookSignature({ ...payload, signature });

      expect(result.isValid).toBe(true);
      expect(result.payload?.status).toBe('COMPLETE');
    });

    it('should process webhook raw body through client method', () => {
      const client = new EsewaClient(validConfig);
      const signedFieldNames =
        'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names';
      const payload = {
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
        signed_field_names: signedFieldNames,
      };
      const message = signedFieldNames
        .split(',')
        .map((field) => `${field}=${payload[field as keyof typeof payload]}`)
        .join(',');
      const signature = generateSignature(message, validConfig.secretKey);

      const result = client.processWebhookBody(JSON.stringify({ ...payload, signature }));

      expect(result.isValid).toBe(true);
      expect(result.payload?.transaction_uuid).toBe('250610-162413');
    });
  });

  describe('initiateRefund', () => {
    const refundRequest = {
      transactionUuid: '250610-162413',
      amount: 1000,
      productCode: 'EPAYTEST',
    };

    it('should return fully refunded status', async () => {
      const client = new EsewaClient(validConfig);
      vi.spyOn(client, 'verifyPayment').mockResolvedValue({
        transaction_code: '000AWEO',
        status: 'FULL_REFUND',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
      });

      const result = await client.initiateRefund(refundRequest);
      expect(result.success).toBe(true);
      expect(result.status).toBe('FULL_REFUND');
    });

    it('should return partially refunded status', async () => {
      const client = new EsewaClient(validConfig);
      vi.spyOn(client, 'verifyPayment').mockResolvedValue({
        transaction_code: '000AWEO',
        status: 'PARTIAL_REFUND',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
      });

      const result = await client.initiateRefund(refundRequest);
      expect(result.success).toBe(true);
      expect(result.status).toBe('PARTIAL_REFUND');
    });

    it('should reject refund for non-complete status', async () => {
      const client = new EsewaClient(validConfig);
      vi.spyOn(client, 'verifyPayment').mockResolvedValue({
        transaction_code: '000AWEO',
        status: 'PENDING',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
      });

      const result = await client.initiateRefund(refundRequest);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot refund transaction with status: PENDING');
    });

    it('should return support message for complete status', async () => {
      const client = new EsewaClient(validConfig);
      vi.spyOn(client, 'verifyPayment').mockResolvedValue({
        transaction_code: '000AWEO',
        status: 'COMPLETE',
        total_amount: 1000,
        transaction_uuid: '250610-162413',
        product_code: 'EPAYTEST',
      });

      const result = await client.initiateRefund(refundRequest);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Refund request registered');
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
