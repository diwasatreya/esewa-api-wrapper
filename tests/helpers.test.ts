import { describe, it, expect, vi } from 'vitest';
import {
  calculateTotalAmount,
  createLogger,
  makeHttpRequest,
  getPaymentUrl,
  getStatusUrl,
  getEnvironmentBaseUrl,
  decodeBase64Json,
  encodeBase64Json,
  maskSensitiveData,
  sleep,
} from '../src/utils/helpers';
import { NetworkError } from '../src/errors';
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

  describe('makeHttpRequest', () => {
    it('should send POST body as JSON string when object is provided', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ success: true }),
        } as Response);

      const result = await makeHttpRequest<{ success: boolean }>({
        url: 'https://example.com/api',
        method: 'POST',
        body: { hello: 'world' },
        retries: 0,
      });

      expect(result.success).toBe(true);
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(options.body).toBe(JSON.stringify({ hello: 'world' }));
      fetchSpy.mockRestore();
    });

    it('should not retry and should throw on 4xx errors', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'invalid payload',
        } as Response);

      await expect(
        makeHttpRequest({
          url: 'https://example.com/api',
          method: 'GET',
          retries: 2,
          retryDelay: 0,
        })
      ).rejects.toThrow(NetworkError);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      fetchSpy.mockRestore();
    });

    it('should retry transient failures and throw after retries are exhausted', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('temporary network failure'));
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(
        makeHttpRequest({
          url: 'https://example.com/api',
          method: 'GET',
          retries: 1,
          retryDelay: 0,
        })
      ).rejects.toThrow('failed after 2 attempts');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      randomSpy.mockRestore();
      fetchSpy.mockRestore();
    });
  });

  describe('createLogger', () => {
    it('should not log when logger is disabled', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const logger = createLogger(false);

      logger('info', 'hidden message');

      expect(infoSpy).not.toHaveBeenCalled();
      infoSpy.mockRestore();
    });

    it('should use level-specific console methods and mask sensitive values', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const logger = createLogger(true, '[unit]');

      logger('error', 'err', { secretKey: 'super-secret' });
      logger('warn', 'warn');
      logger('debug', 'debug');
      logger('info', 'info');

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(String(errorSpy.mock.calls[0][0])).toContain('***REDACTED***');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(debugSpy).toHaveBeenCalledOnce();
      expect(infoSpy).toHaveBeenCalledOnce();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      debugSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });

  describe('sleep', () => {
    it('should resolve after the provided duration', async () => {
      await expect(sleep(0)).resolves.toBeUndefined();
    });
  });
});
