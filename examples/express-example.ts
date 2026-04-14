/**
 * Express.js Integration Example
 *
 * This example demonstrates how to integrate the eSewa Payment Gateway
 * with an Express.js application using esewa-api-wrapper.
 *
 * Quick Start:
 *   1. npm install express esewa-api-wrapper dotenv
 *   2. Copy .env.example to .env and fill in your credentials
 *   3. ts-node examples/express-example.ts
 */

import express from 'express';
import { EsewaClient, SignatureError, ValidationError } from 'esewa-api-wrapper';

// Load environment variables
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Initialize eSewa Client ────────────────────────────────

const esewa = new EsewaClient({
  merchantId: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
  secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
  environment: (process.env.ESEWA_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  successUrl: process.env.ESEWA_SUCCESS_URL || 'http://localhost:3000/payment/success',
  failureUrl: process.env.ESEWA_FAILURE_URL || 'http://localhost:3000/payment/failure',
  enableLogging: true,
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * GET /
 * Landing page with a simple payment button.
 */
app.get('/', (_req, res) => {
  res.send(`
    <html>
      <head><title>eSewa Payment Demo</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto;">
        <h1>🛒 eSewa Payment Demo</h1>
        <p>Click below to initiate a test payment of Rs. 100</p>
        <form action="/pay" method="POST">
          <input type="hidden" name="amount" value="100" />
          <input type="hidden" name="productName" value="Test Product" />
          <button type="submit" style="padding: 12px 24px; background: #60bb46; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">
            Pay with eSewa
          </button>
        </form>
      </body>
    </html>
  `);
});

/**
 * POST /pay
 * Creates a payment and redirects the user to eSewa.
 *
 * Option A: Redirect-based (returns URL + form data for client-side form submission)
 * Option B: HTML form auto-submit (server-rendered)
 */
app.post('/pay', (req, res) => {
  try {
    const amount = parseFloat(req.body.amount) || 100;
    const transactionUuid = esewa.generateTransactionUuid();

    // Option B: Use the auto-submitting HTML form (recommended for SSR)
    const html = esewa.generatePaymentForm({
      amount,
      taxAmount: 0,
      serviceCharge: 0,
      deliveryCharge: 0,
      transactionUuid,
      productCode: 'EPAYTEST',
    });

    // Store transactionUuid in your database here with order details
    console.log(`Payment initiated: ${transactionUuid} for Rs. ${amount}`);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      console.error('Payment initiation failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * GET /payment/success
 * Success callback — eSewa redirects the user here after successful payment.
 * The `data` query parameter contains a Base64-encoded response.
 */
app.get('/payment/success', async (req, res) => {
  try {
    const encodedData = req.query.data as string;

    if (!encodedData) {
      return res.status(400).json({ error: 'Missing response data' });
    }

    // Step 1: Decode and verify the signature
    const response = esewa.decodeResponse(encodedData);
    console.log('Decoded response:', response);

    // Step 2: Server-to-server verification (ALWAYS do this!)
    const verification = await esewa.verifyPayment({
      transactionUuid: response.transaction_uuid,
      totalAmount: Number(response.total_amount),
      productCode: response.product_code,
    });

    console.log('Verification result:', verification);

    if (verification.status === 'COMPLETE') {
      // ✅ Payment confirmed — update your database
      res.send(`
        <html>
          <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto;">
            <h1>✅ Payment Successful!</h1>
            <p><strong>Transaction Code:</strong> ${response.transaction_code}</p>
            <p><strong>Amount:</strong> Rs. ${response.total_amount}</p>
            <p><strong>Transaction ID:</strong> ${response.transaction_uuid}</p>
            <p><strong>Reference:</strong> ${verification.ref_id}</p>
            <a href="/">← Back to Home</a>
          </body>
        </html>
      `);
    } else {
      res.status(400).send(`<h1>⚠️ Payment ${verification.status}</h1><a href="/">← Back</a>`);
    }
  } catch (error) {
    if (error instanceof SignatureError) {
      console.error('⚠️ SIGNATURE MISMATCH — possible tampering!', error.message);
      res.status(403).json({ error: 'Signature verification failed' });
    } else {
      console.error('Payment verification error:', error);
      res.status(500).json({ error: 'Verification failed' });
    }
  }
});

/**
 * GET /payment/failure
 * Failure callback — eSewa redirects the user here on payment failure/cancellation.
 */
app.get('/payment/failure', (_req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto;">
        <h1>❌ Payment Failed</h1>
        <p>Your payment was not completed. Please try again.</p>
        <a href="/">← Back to Home</a>
      </body>
    </html>
  `);
});

/**
 * POST /webhook/esewa
 * Webhook endpoint for receiving eSewa notifications.
 */
app.post('/webhook/esewa', (req, res) => {
  const result = esewa.verifyWebhookSignature(
    req.body,
    req.headers['x-esewa-signature'] as string
  );

  if (result.isValid && result.payload) {
    console.log('✅ Valid webhook received:', result.payload.transaction_uuid);
    // Process the webhook (update order status, etc.)
    res.json({ received: true });
  } else {
    console.error('❌ Invalid webhook:', result.error);
    res.status(403).json({ error: 'Invalid webhook signature' });
  }
});

// ─── Start Server ───────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 eSewa Payment Demo running at http://localhost:${PORT}`);
  console.log(`   Environment: ${esewa.getEnvironment()}`);
  console.log(`   Merchant ID: ${esewa.getMerchantId()}\n`);
});
