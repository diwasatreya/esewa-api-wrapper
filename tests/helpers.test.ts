import { describe, it, expect } from 'vitest';
import {
  calculateTotalAmount,
  getPaymentUrl,
  getStatusUrl,
  getEnvironmentBaseUrl,
  decodeBase64Json,
  encodeBase64Json,
  maskSensitiveData,
} from '../src/utils/helpers';
import type { PaymentRequest } from '../src/types';

describe('Helper Utilities', () => {
  describe('calculateTotalAmount', () => {
    it('should calculate total with all components', () => {
      const request: PaymentRequest = {
        amount: 1000,
        taxAmount: 130,
        serviceCharge: 50,
        deliveryCharge: 100,
        transactionUuid: 'test',
        productCode: 'EPAYTEST',
      };

      expect(calculateTotalAmount(request)).toBe(1280);
    });

    it('should default optional fields to 0', () => {
      const request: PaymentRequest = {
        amount: 1000,
        transactionUuid: 'test',
        productCode: 'EPAYTEST',
      };

      expect(calculateTotalAmount(request)).toBe(1000);
    });

    it('should handle decimal amounts correctly', () => {
      const request: PaymentRequest = {
        amount: 99.99,
        taxAmount: 0.01,
        transactionUuid: 'test',
        productCode: 'EPAYTEST',
      };

      expect(calculateTotalAmount(request)).toBe(100);
    });

    it('should avoid floating point precision issues', () => {
      const request: PaymentRequest = {
        amount: 0.1,
        taxAmount: 0.2,
        transactionUuid: 'test',
        productCode: 'EPAYTEST',
      };

      // 0.1 + 0.2 should be 0.3, not 0.30000000000000004
      expect(calculateTotalAmount(request)).toBe(0.3);
    });
  });

  describe('URL Helpers', () => {
    it('getPaymentUrl should return sandbox URL', () => {
      expect(getPaymentUrl('sandbox')).toBe('https://rc-epay.esewa.com.np/api/epay/main/v2/form');
    });

    it('getPaymentUrl should return production URL', () => {
      expect(getPaymentUrl('production')).toBe('https://epay.esewa.com.np/api/epay/main/v2/form');
    });

    it('getStatusUrl should return sandbox URL', () => {
      expect(getStatusUrl('sandbox')).toBe('https://rc.esewa.com.np/api/epay/transaction/status/');
    });

    it('getStatusUrl should return production URL', () => {
      expect(getStatusUrl('production')).toBe('https://esewa.com.np/api/epay/transaction/status/');
    });

    it('getEnvironmentBaseUrl should return all URLs', () => {
      const urls = getEnvironmentBaseUrl('sandbox');
      expect(urls).toHaveProperty('payment');
      expect(urls).toHaveProperty('status');
    });
  });

  describe('Base64 Helpers', () => {
    it('should round-trip encode and decode JSON', () => {
      const original = { foo: 'bar', num: 42 };
      const encoded = encodeBase64Json(original);
      const decoded = decodeBase64Json<typeof original>(encoded);

      expect(decoded).toEqual(original);
    });

    it('should decode a known Base64 JSON string', () => {
      const data = { status: 'COMPLETE', total_amount: 1000 };
      const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
      const decoded = decodeBase64Json<typeof data>(encoded);

      expect(decoded.status).toBe('COMPLETE');
      expect(decoded.total_amount).toBe(1000);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask secretKey fields', () => {
      const data = { merchantId: 'TEST', secretKey: 'super-secret' };
      const masked = maskSensitiveData(data);

      expect(masked.merchantId).toBe('TEST');
      expect(masked.secretKey).toBe('***REDACTED***');
    });

    it('should mask signature fields', () => {
      const data = { amount: 100, signature: 'abc123' };
      const masked = maskSensitiveData(data);

      expect(masked.amount).toBe(100);
      expect(masked.signature).toBe('***REDACTED***');
    });

    it('should mask nested sensitive fields', () => {
      const data = {
        config: {
          secretKey: 'hidden',
          merchantId: 'visible',
        },
      };
      const masked = maskSensitiveData(data);
      const maskedConfig = masked.config as Record<string, unknown>;

      expect(maskedConfig.secretKey).toBe('***REDACTED***');
      expect(maskedConfig.merchantId).toBe('visible');
    });

    it('should not modify non-sensitive fields', () => {
      const data = { name: 'test', amount: 100 };
      const masked = maskSensitiveData(data);

      expect(masked).toEqual(data);
    });
  });
});
