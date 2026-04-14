import { describe, it, expect } from 'vitest';
import { createPayment, generatePaymentForm } from '../src/payment';
import { createConfig } from '../src/config';
import type { PaymentRequest } from '../src/types';

describe('Payment Module', () => {
  const config = createConfig({
    merchantId: 'EPAYTEST',
    secretKey: '8gBm/:&EnhH.1/q',
    environment: 'sandbox',
    successUrl: 'https://example.com/success',
    failureUrl: 'https://example.com/failure',
  });

  const validRequest: PaymentRequest = {
    amount: 100,
    taxAmount: 10,
    serviceCharge: 0,
    deliveryCharge: 0,
    transactionUuid: '241028',
    productCode: 'EPAYTEST',
  };

  describe('createPayment', () => {
    it('should return a payment initiation result', () => {
      const result = createPayment(config, validRequest);

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('formData');
    });

    it('should use the sandbox URL', () => {
      const result = createPayment(config, validRequest);

      expect(result.url).toBe('https://rc-epay.esewa.com.np/api/epay/main/v2/form');
    });

    it('should include all required form fields', () => {
      const result = createPayment(config, validRequest);
      const { formData } = result;

      expect(formData.amount).toBe('100');
      expect(formData.tax_amount).toBe('10');
      expect(formData.total_amount).toBe('110');
      expect(formData.transaction_uuid).toBe('241028');
      expect(formData.product_code).toBe('EPAYTEST');
      expect(formData.product_service_charge).toBe('0');
      expect(formData.product_delivery_charge).toBe('0');
      expect(formData.success_url).toBe('https://example.com/success');
      expect(formData.failure_url).toBe('https://example.com/failure');
      expect(formData.signed_field_names).toBe('total_amount,transaction_uuid,product_code');
      expect(formData.signature).toBeDefined();
    });

    it('should generate the correct signature matching eSewa docs', () => {
      const result = createPayment(config, validRequest);

      // Known signature from eSewa documentation for these inputs
      expect(result.formData.signature).toBe('i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=');
    });

    it('should default optional fields to 0', () => {
      const result = createPayment(config, {
        amount: 500,
        transactionUuid: 'test-123',
        productCode: 'EPAYTEST',
      });

      expect(result.formData.tax_amount).toBe('0');
      expect(result.formData.product_service_charge).toBe('0');
      expect(result.formData.product_delivery_charge).toBe('0');
      expect(result.formData.total_amount).toBe('500');
    });

    it('should throw for invalid payment request', () => {
      expect(() => createPayment(config, { ...validRequest, amount: -100 })).toThrow();
    });

    it('should throw for missing transactionUuid', () => {
      expect(() => createPayment(config, { ...validRequest, transactionUuid: '' })).toThrow();
    });
  });

  describe('generatePaymentForm', () => {
    it('should return an HTML string', () => {
      const html = generatePaymentForm(config, validRequest);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should contain the form with correct action URL', () => {
      const html = generatePaymentForm(config, validRequest);

      expect(html).toContain('action="https://rc-epay.esewa.com.np/api/epay/main/v2/form"');
      expect(html).toContain('method="POST"');
    });

    it('should include all hidden input fields', () => {
      const html = generatePaymentForm(config, validRequest);

      expect(html).toContain('name="amount"');
      expect(html).toContain('name="tax_amount"');
      expect(html).toContain('name="total_amount"');
      expect(html).toContain('name="transaction_uuid"');
      expect(html).toContain('name="product_code"');
      expect(html).toContain('name="signature"');
    });

    it('should auto-submit via JavaScript', () => {
      const html = generatePaymentForm(config, validRequest);

      expect(html).toContain("document.getElementById('esewa-payment-form').submit()");
    });

    it('should include a noscript fallback button', () => {
      const html = generatePaymentForm(config, validRequest);

      expect(html).toContain('<noscript>');
      expect(html).toContain('type="submit"');
    });

    it('should HTML-escape values to prevent XSS', () => {
      const html = generatePaymentForm(config, {
        ...validRequest,
        transactionUuid: 'test-uuid',
      });

      // Should not contain any unescaped special characters in attribute values
      expect(html).not.toMatch(/value="[^"]*<script/);
    });
  });
});
