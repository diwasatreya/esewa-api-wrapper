/**
 * @module payment
 * @description Payment initiation module for the eSewa API Wrapper.
 * Handles creating payment URLs, generating signed form data, and
 * building auto-submitting HTML forms for server-rendered applications.
 */

import type {
  EsewaConfig,
  PaymentFormData,
  PaymentInitiationResult,
  PaymentRequest,
} from './types';
import { generatePaymentSignature } from './utils/crypto';
import { calculateTotalAmount, getPaymentUrl } from './utils/helpers';
import { sanitizeString, validatePaymentRequest } from './utils/validator';

/**
 * The signed field names used by eSewa for payment signature generation.
 * These must be in this exact order as specified by the eSewa v2 API.
 */
const SIGNED_FIELD_NAMES = 'total_amount,transaction_uuid,product_code';

/**
 * Creates a payment initiation result containing the eSewa payment URL
 * and the signed form data required for the POST request.
 *
 * The form data includes an HMAC-SHA256 signature generated from the
 * total amount, transaction UUID, and product code using the merchant's
 * secret key.
 *
 * @param config - The eSewa client configuration
 * @param request - The payment request details
 * @returns Payment initiation result with URL and signed form data
 * @throws {ValidationError} If the payment request is invalid
 *
 * @example
 * ```typescript
 * const result = createPayment(config, {
 *   amount: 1000,
 *   taxAmount: 130,
 *   transactionUuid: '241028-abc123',
 *   productCode: 'EPAYTEST',
 * });
 *
 * // Redirect user to result.url with result.formData as POST body
 * ```
 */
export function createPayment(
  config: Readonly<Required<EsewaConfig>>,
  request: PaymentRequest
): PaymentInitiationResult {
  // Validate the payment request
  validatePaymentRequest(request);

  // Calculate total amount
  const totalAmount = calculateTotalAmount(request);

  // Sanitize string inputs
  const transactionUuid = sanitizeString(request.transactionUuid);
  const productCode = sanitizeString(request.productCode);

  // Generate HMAC-SHA256 signature
  const signature = generatePaymentSignature(
    totalAmount,
    transactionUuid,
    productCode,
    config.secretKey
  );

  // Build form data matching eSewa's expected parameter names
  const formData: PaymentFormData = {
    amount: String(request.amount),
    tax_amount: String(request.taxAmount ?? 0),
    total_amount: String(totalAmount),
    transaction_uuid: transactionUuid,
    product_code: productCode,
    product_service_charge: String(request.serviceCharge ?? 0),
    product_delivery_charge: String(request.deliveryCharge ?? 0),
    success_url: config.successUrl,
    failure_url: config.failureUrl,
    signed_field_names: SIGNED_FIELD_NAMES,
    signature,
  };

  const url = getPaymentUrl(config.environment);

  return { url, formData };
}

/**
 * Generates an auto-submitting HTML form that redirects the user to eSewa's
 * payment page. Useful for server-rendered applications (Express, Next.js SSR, etc.).
 *
 * The generated form auto-submits via JavaScript when loaded in the browser.
 * If JavaScript is disabled, a submit button is shown as a fallback.
 *
 * @param config - The eSewa client configuration
 * @param request - The payment request details
 * @returns Complete HTML string containing the auto-submitting form
 * @throws {ValidationError} If the payment request is invalid
 *
 * @example
 * ```typescript
 * // Express.js example
 * app.post('/pay', (req, res) => {
 *   const html = generatePaymentForm(config, {
 *     amount: 1000,
 *     transactionUuid: '241028-abc123',
 *     productCode: 'EPAYTEST',
 *   });
 *   res.setHeader('Content-Type', 'text/html');
 *   res.send(html);
 * });
 * ```
 */
export function generatePaymentForm(
  config: Readonly<Required<EsewaConfig>>,
  request: PaymentRequest
): string {
  const { url, formData } = createPayment(config, request);

  // Build hidden input fields — values are HTML-escaped to prevent XSS
  const inputs = Object.entries(formData)
    .map(
      ([name, value]) =>
        `    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}" />`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirecting to eSewa...</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e0e0e0;
      border-top-color: #60bb46;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .fallback-btn {
      display: none;
      margin-top: 1rem;
      padding: 0.75rem 2rem;
      background: #60bb46;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
    }
    .fallback-btn:hover {
      background: #4fa038;
    }
    noscript .fallback-btn {
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Redirecting to eSewa Payment Gateway...</p>
    <form id="esewa-payment-form" action="${escapeHtml(url)}" method="POST">
${inputs}
      <noscript>
        <button type="submit" class="fallback-btn">Click here to continue to eSewa</button>
      </noscript>
    </form>
  </div>
  <script>
    document.getElementById('esewa-payment-form').submit();
  </script>
</body>
</html>`;
}

/**
 * Escapes HTML special characters to prevent XSS injection.
 *
 * @param str - The string to escape
 * @returns HTML-escaped string
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
