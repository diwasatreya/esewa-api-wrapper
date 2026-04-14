/**
 * @module utils/validator
 * @description Input validation and sanitization utilities.
 * Prevents injection attacks, validates data formats, and ensures
 * all user-provided input conforms to eSewa API requirements.
 */

import { ValidationError } from '../errors';
import type { EsewaConfig, PaymentRequest, PaymentVerificationRequest } from '../types';

/**
 * Validates the eSewa client configuration object.
 *
 * @param config - The configuration to validate
 * @throws {ValidationError} If any required field is missing or invalid
 */
export function validateConfig(config: EsewaConfig): void {
  if (!config) {
    throw new ValidationError('Configuration object is required');
  }

  if (!config.merchantId || typeof config.merchantId !== 'string') {
    throw new ValidationError('merchantId is required and must be a non-empty string');
  }

  if (!config.secretKey || typeof config.secretKey !== 'string') {
    throw new ValidationError('secretKey is required and must be a non-empty string');
  }

  if (!config.environment || !['sandbox', 'production'].includes(config.environment)) {
    throw new ValidationError('environment must be either "sandbox" or "production"');
  }

  if (!config.successUrl || typeof config.successUrl !== 'string') {
    throw new ValidationError('successUrl is required and must be a non-empty string');
  }

  if (!config.failureUrl || typeof config.failureUrl !== 'string') {
    throw new ValidationError('failureUrl is required and must be a non-empty string');
  }

  // Validate URL formats
  validateUrl(config.successUrl, 'successUrl');
  validateUrl(config.failureUrl, 'failureUrl');

  // Enforce HTTPS in production
  if (config.environment === 'production') {
    if (!config.successUrl.startsWith('https://')) {
      throw new ValidationError('successUrl must use HTTPS in production environment');
    }
    if (!config.failureUrl.startsWith('https://')) {
      throw new ValidationError('failureUrl must use HTTPS in production environment');
    }
  }

  // Validate optional numeric fields
  if (config.maxRetries !== undefined) {
    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0 || config.maxRetries > 10) {
      throw new ValidationError('maxRetries must be a number between 0 and 10');
    }
  }

  if (config.retryDelay !== undefined) {
    if (
      typeof config.retryDelay !== 'number' ||
      config.retryDelay < 100 ||
      config.retryDelay > 30000
    ) {
      throw new ValidationError('retryDelay must be a number between 100 and 30000 milliseconds');
    }
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout < 1000 || config.timeout > 120000) {
      throw new ValidationError('timeout must be a number between 1000 and 120000 milliseconds');
    }
  }
}

/**
 * Validates a payment request object.
 *
 * @param request - The payment request to validate
 * @throws {ValidationError} If any required field is missing or invalid
 */
export function validatePaymentRequest(request: PaymentRequest): void {
  if (!request) {
    throw new ValidationError('Payment request object is required');
  }

  // Validate amount
  if (typeof request.amount !== 'number' || request.amount <= 0) {
    throw new ValidationError('amount must be a positive number');
  }

  if (!Number.isFinite(request.amount)) {
    throw new ValidationError('amount must be a finite number');
  }

  // Validate optional numeric fields
  if (request.taxAmount !== undefined) {
    if (typeof request.taxAmount !== 'number' || request.taxAmount < 0) {
      throw new ValidationError('taxAmount must be a non-negative number');
    }
  }

  if (request.serviceCharge !== undefined) {
    if (typeof request.serviceCharge !== 'number' || request.serviceCharge < 0) {
      throw new ValidationError('serviceCharge must be a non-negative number');
    }
  }

  if (request.deliveryCharge !== undefined) {
    if (typeof request.deliveryCharge !== 'number' || request.deliveryCharge < 0) {
      throw new ValidationError('deliveryCharge must be a non-negative number');
    }
  }

  // Validate transactionUuid
  if (!request.transactionUuid || typeof request.transactionUuid !== 'string') {
    throw new ValidationError('transactionUuid is required and must be a non-empty string');
  }

  // eSewa requires alphanumeric characters and hyphens only
  if (!/^[a-zA-Z0-9-]+$/.test(request.transactionUuid)) {
    throw new ValidationError(
      'transactionUuid must contain only alphanumeric characters and hyphens'
    );
  }

  if (request.transactionUuid.length > 100) {
    throw new ValidationError('transactionUuid must not exceed 100 characters');
  }

  // Validate productCode
  if (!request.productCode || typeof request.productCode !== 'string') {
    throw new ValidationError('productCode is required and must be a non-empty string');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(request.productCode)) {
    throw new ValidationError(
      'productCode must contain only alphanumeric characters, underscores, and hyphens'
    );
  }
}

/**
 * Validates a payment verification request object.
 *
 * @param request - The verification request to validate
 * @throws {ValidationError} If any required field is missing or invalid
 */
export function validateVerificationRequest(request: PaymentVerificationRequest): void {
  if (!request) {
    throw new ValidationError('Verification request object is required');
  }

  if (!request.transactionUuid || typeof request.transactionUuid !== 'string') {
    throw new ValidationError('transactionUuid is required and must be a non-empty string');
  }

  if (typeof request.totalAmount !== 'number' || request.totalAmount <= 0) {
    throw new ValidationError('totalAmount must be a positive number');
  }

  if (!Number.isFinite(request.totalAmount)) {
    throw new ValidationError('totalAmount must be a finite number');
  }

  if (!request.productCode || typeof request.productCode !== 'string') {
    throw new ValidationError('productCode is required and must be a non-empty string');
  }
}

/**
 * Validates a URL string.
 *
 * @param url - The URL string to validate
 * @param fieldName - The field name for error messages
 * @throws {ValidationError} If the URL is invalid
 */
export function validateUrl(url: string, fieldName: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError(`${fieldName} must use HTTP or HTTPS protocol`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`${fieldName} is not a valid URL: ${url}`);
  }
}

/**
 * Sanitizes a string value by trimming whitespace and removing control characters.
 *
 * @param value - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeString(value: string): string {
  // Remove control characters (except common whitespace)
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validates that a Base64-encoded string is properly formatted.
 *
 * @param value - The string to validate
 * @param fieldName - The field name for error messages
 * @throws {ValidationError} If the string is not valid Base64
 */
export function validateBase64(value: string, fieldName: string): void {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`);
  }

  // Standard Base64 pattern (with padding)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(value)) {
    throw new ValidationError(`${fieldName} is not a valid Base64-encoded string`);
  }
}

/**
 * Validates an amount value for eSewa transactions.
 *
 * @param amount - The amount to validate
 * @param fieldName - The field name for error messages
 * @throws {ValidationError} If the amount is invalid
 */
export function validateAmount(amount: number, fieldName: string): void {
  if (typeof amount !== 'number') {
    throw new ValidationError(`${fieldName} must be a number`);
  }

  if (!Number.isFinite(amount)) {
    throw new ValidationError(`${fieldName} must be a finite number`);
  }

  if (amount < 0) {
    throw new ValidationError(`${fieldName} must not be negative`);
  }

  // eSewa uses 2 decimal places max
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    throw new ValidationError(`${fieldName} must not have more than 2 decimal places`);
  }
}
