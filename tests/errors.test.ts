import { describe, it, expect } from 'vitest';
import {
  ConfigurationError,
  EsewaError,
  NetworkError,
  SignatureError,
  ValidationError,
} from '../src/errors';
import { EsewaErrorCode } from '../src/types';

describe('Error classes module', () => {
  it('should create network errors with the expected code', () => {
    const cause = new Error('socket timeout');
    const error = new NetworkError('network failed', {
      cause,
      details: { statusCode: 504 },
    });

    expect(error).toBeInstanceOf(EsewaError);
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe(EsewaErrorCode.NETWORK_ERROR);
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual({ statusCode: 504 });
  });

  it('should create configuration errors with the expected code', () => {
    const error = new ConfigurationError('missing merchant id');

    expect(error).toBeInstanceOf(EsewaError);
    expect(error.name).toBe('ConfigurationError');
    expect(error.code).toBe(EsewaErrorCode.CONFIGURATION_ERROR);
  });

  it('should preserve subclass codes in validation and signature errors', () => {
    const validationError = new ValidationError('invalid amount');
    const signatureError = new SignatureError('invalid signature');

    expect(validationError.code).toBe(EsewaErrorCode.VALIDATION_ERROR);
    expect(signatureError.code).toBe(EsewaErrorCode.SIGNATURE_ERROR);
  });
});
