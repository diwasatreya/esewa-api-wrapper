<div align="center">

# 💚 esewa-api-wrapper

### A secure and developer-friendly Node.js wrapper for the eSewa Payment Gateway.

[![npm version](https://img.shields.io/npm/v/esewa-api-wrapper.svg?style=flat-square&color=60bb46)](https://www.npmjs.com/package/esewa-api-wrapper)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg?style=flat-square)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg?style=flat-square)](https://nodejs.org)

[Installation](#-installation) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Examples](#-examples) · [Security](#-security)

</div>

---

## ✨ Features

- 🔐 **HMAC-SHA256 Signed Requests** — Automatic signature generation & verification
- 🛡️ **Tamper-Proof Responses** — Timing-safe signature verification prevents fraud
- 🏗️ **TypeScript First** — Full type definitions with comprehensive JSDoc
- 🌐 **Dual Environment** — Seamless switching between sandbox and production
- 📦 **ESM + CommonJS** — Works everywhere — import or require
- 🔄 **Auto Retry** — Exponential backoff for transient network failures
- 🪵 **Debug Logging** — Optional logs with automatic sensitive data masking
- ⚡ **Zero Dependencies** — Uses only Node.js built-in modules
- 🌳 **Tree-Shakable** — Import only what you need

---

## 📦 Installation

```bash
npm install esewa-api-wrapper
```

---

## 🔧 Environment Setup

Create a `.env` file in your project root:

```env
ESEWA_MERCHANT_ID=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q
ESEWA_ENVIRONMENT=sandbox
ESEWA_SUCCESS_URL=http://localhost:3000/payment/success
ESEWA_FAILURE_URL=http://localhost:3000/payment/failure
```

> ⚠️ **Never commit `.env` to version control.** Add it to `.gitignore`.

### Sandbox Test Credentials

| Field | Value |
|-------|-------|
| Merchant ID | `EPAYTEST` |
| Secret Key | `8gBm/:&EnhH.1/q` |
| eSewa ID | `9806800001` to `9806800005` |
| Password | `Nepal@123` |
| MPIN | `1122` |
| OTP Token | `123456` |

---

## 🚀 Quick Start

```typescript
import { EsewaClient } from 'esewa-api-wrapper';

const esewa = new EsewaClient({
  merchantId: 'EPAYTEST',
  secretKey: process.env.ESEWA_SECRET_KEY!,
  environment: 'sandbox',
  successUrl: 'https://yourdomain.com/payment/success',
  failureUrl: 'https://yourdomain.com/payment/failure',
});

// 1. Create a payment
const payment = esewa.createPayment({
  amount: 1000,
  taxAmount: 0,
  serviceCharge: 0,
  deliveryCharge: 0,
  transactionUuid: esewa.generateTransactionUuid(),
  productCode: 'EPAYTEST',
});

console.log(payment.url);      // eSewa payment form URL
console.log(payment.formData); // Signed form data to POST

// 2. Verify a payment (after success callback)
const status = await esewa.verifyPayment({
  transactionUuid: 'your-transaction-uuid',
  totalAmount: 1000,
  productCode: 'EPAYTEST',
});

if (status.status === 'COMPLETE') {
  console.log('Payment confirmed!', status.ref_id);
}
```

---

## 📖 API Reference

### `new EsewaClient(config)`

```typescript
interface EsewaConfig {
  merchantId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
  successUrl: string;
  failureUrl: string;
  enableLogging?: boolean;   // default: false
  maxRetries?: number;       // default: 3
  retryDelay?: number;       // default: 1000ms
  timeout?: number;          // default: 30000ms
}
```

### `esewa.createPayment(options)`

Generates a signed payment URL and form data for redirecting users to eSewa.

```typescript
const { url, formData } = esewa.createPayment({
  amount: 1000,
  taxAmount: 130,
  transactionUuid: esewa.generateTransactionUuid(),
  productCode: 'EPAYTEST',
});
```

### `esewa.generatePaymentForm(options)`

Returns an auto-submitting HTML page. Ideal for server-rendered apps.

```typescript
app.post('/pay', (req, res) => {
  const html = esewa.generatePaymentForm({
    amount: 1000,
    transactionUuid: esewa.generateTransactionUuid(),
    productCode: 'EPAYTEST',
  });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
```

### `esewa.verifyPayment(options)`

Server-to-server verification via eSewa's status check API.

```typescript
const result = await esewa.verifyPayment({
  transactionUuid: 'your-transaction-uuid',
  totalAmount: 1000,
  productCode: 'EPAYTEST',
});
// result.status: 'COMPLETE' | 'PENDING' | 'FULL_REFUND' | ...
```

### `esewa.decodeResponse(encodedData)`

Decodes and signature-verifies the Base64-encoded response from eSewa's success redirect.

```typescript
app.get('/payment/success', (req, res) => {
  try {
    const response = esewa.decodeResponse(req.query.data as string);
    // response.status, response.transaction_code, response.total_amount
  } catch (error) {
    if (error instanceof SignatureError) {
      // Possible tampering — DO NOT process this payment
    }
  }
});
```

### `esewa.verifyWebhookSignature(payload, signature?)`

Verifies incoming webhook notification signatures.

```typescript
app.post('/webhook/esewa', (req, res) => {
  const result = esewa.verifyWebhookSignature(
    req.body,
    req.headers['x-esewa-signature'] as string
  );

  if (result.isValid) {
    res.json({ received: true });
  } else {
    res.status(403).json({ error: result.error });
  }
});
```

### Utility Methods

| Method | Description |
|--------|-------------|
| `generateTransactionUuid()` | Generates a unique `YYMMDD-xxxxxxxxxxxx` transaction ID |
| `calculateTotalAmount(request)` | Sums amount + tax + service + delivery charges |
| `signPayload(payload)` | Signs any `{ key: value }` object with HMAC-SHA256 |
| `verifySignature(payload, sig, fields)` | Timing-safe signature verification |
| `getEnvironmentBaseUrl()` | Returns `{ payment, status }` URLs for current env |
| `getEnvironment()` | Returns `'sandbox'` or `'production'` |
| `getMerchantId()` | Returns the configured merchant ID |

### Standalone Exports (Tree-Shakable)

```typescript
import {
  generatePaymentSignature,
  verifySignature,
  generateTransactionUuid,
  calculateTotalAmount,
  getPaymentUrl,
} from 'esewa-api-wrapper';
```

---

## 💡 Examples

### Express.js

```typescript
import express from 'express';
import { EsewaClient, SignatureError } from 'esewa-api-wrapper';

const app = express();
const esewa = new EsewaClient({ /* config */ });

app.post('/pay', (req, res) => {
  const html = esewa.generatePaymentForm({
    amount: parseFloat(req.body.amount),
    transactionUuid: esewa.generateTransactionUuid(),
    productCode: 'EPAYTEST',
  });
  res.send(html);
});

app.get('/payment/success', async (req, res) => {
  const response = esewa.decodeResponse(req.query.data as string);
  const status = await esewa.verifyPayment({
    transactionUuid: response.transaction_uuid,
    totalAmount: response.total_amount,
    productCode: response.product_code,
  });
  if (status.status === 'COMPLETE') res.send('Payment successful!');
});
```

### Next.js

```typescript
// app/api/payment/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { esewa } from '@/lib/esewa';

export async function POST(request: NextRequest) {
  const { amount } = await request.json();

  const payment = esewa.createPayment({
    amount,
    transactionUuid: esewa.generateTransactionUuid(),
    productCode: process.env.ESEWA_PRODUCT_CODE!,
  });

  return NextResponse.json({
    paymentUrl: payment.url,
    formData: payment.formData,
  });
}
```

See full examples: [`examples/express-example.ts`](examples/express-example.ts) · [`examples/nextjs-example.ts`](examples/nextjs-example.ts)

---

## 🔐 Security

1. **Never expose `secretKey` client-side** — Keep it in server-side environment variables only.
2. **Always verify payments server-to-server** — Call `verifyPayment()` after receiving a success callback.
3. **Validate response signatures** — `decodeResponse()` automatically verifies HMAC-SHA256 signatures.
4. **Use HTTPS in production** — The client enforces HTTPS for success/failure URLs in production mode.
5. **Generate unique transaction UUIDs** — Use `generateTransactionUuid()` to prevent replay attacks.

---

## 🧪 Error Handling

```typescript
import {
  EsewaError,
  ValidationError,
  SignatureError,
  NetworkError,
  ConfigurationError,
} from 'esewa-api-wrapper';

try {
  await esewa.verifyPayment({ /* ... */ });
} catch (error) {
  if (error instanceof SignatureError) {
    // ⚠️ Possible tampering detected
  } else if (error instanceof NetworkError) {
    // 🌐 eSewa API unreachable — retry later
  } else if (error instanceof ValidationError) {
    // ❌ Invalid parameters
  }
}
```

---

## 🏗️ Transaction Flow

```
┌──────────┐    1. createPayment()     ┌──────────┐
│          │ ──────────────────────────▶│          │
│  Your    │    2. Redirect (POST)      │  eSewa   │
│  Server  │ ──────────────────────────▶│  ePay    │
│          │                            │          │
│          │    3. Success redirect      │          │
│          │ ◀──────────────────────────│          │
│          │    4. decodeResponse()      │          │
│          │                            │          │
│          │    5. verifyPayment()       │          │
│          │ ──────────────────────────▶│          │
│          │    6. Status response       │          │
│          │ ◀──────────────────────────│          │
└──────────┘                            └──────────┘
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © [Diwas Atreya](https://github.com/diwasatreya)

---

<div align="center">
  <sub>Built with 💚 for the Nepali developer community</sub>
</div>
