/**
 * Next.js Integration Example
 *
 * This example demonstrates how to integrate the eSewa Payment Gateway
 * with a Next.js application using esewa-api-wrapper.
 *
 * These are Next.js API Route handlers (App Router).
 * Place these files in your Next.js `app/api/` directory.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: lib/esewa.ts — Shared eSewa client instance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { EsewaClient } from 'esewa-api-wrapper';

// Create a singleton client instance
export const esewa = new EsewaClient({
  merchantId: process.env.ESEWA_MERCHANT_ID!,
  secretKey: process.env.ESEWA_SECRET_KEY!,
  environment: (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox') as
    | 'sandbox'
    | 'production',
  successUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/success`,
  failureUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payment/failure`,
  enableLogging: process.env.NODE_ENV !== 'production',
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: app/api/payment/initiate/route.ts — Payment initiation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
// import { esewa } from '@/lib/esewa';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, productId } = body;

    // Generate a unique transaction ID
    const transactionUuid = esewa.generateTransactionUuid();

    // Create the payment
    const payment = esewa.createPayment({
      amount: parseFloat(amount),
      taxAmount: 0,
      serviceCharge: 0,
      deliveryCharge: 0,
      transactionUuid,
      productCode: process.env.ESEWA_PRODUCT_CODE || 'EPAYTEST',
    });

    // TODO: Save transactionUuid + productId + amount to your database

    // Return the payment URL and form data for client-side form submission
    return NextResponse.json({
      success: true,
      paymentUrl: payment.url,
      formData: payment.formData,
      transactionUuid,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: app/api/payment/success/route.ts — Success callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// import { NextRequest, NextResponse } from 'next/server';
// import { esewa } from '@/lib/esewa';
import { SignatureError } from 'esewa-api-wrapper';

export async function GET_success(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const encodedData = searchParams.get('data');

    if (!encodedData) {
      return NextResponse.redirect(new URL('/payment/error?reason=missing_data', request.url));
    }

    // Step 1: Decode and verify the response signature
    const response = esewa.decodeResponse(encodedData);

    // Step 2: Server-to-server verification
    const verification = await esewa.verifyPayment({
      transactionUuid: response.transaction_uuid,
      totalAmount: response.total_amount,
      productCode: response.product_code,
    });

    if (verification.status === 'COMPLETE') {
      // ✅ Update order status in your database
      // await db.order.update({ transactionUuid: response.transaction_uuid, status: 'paid' });

      return NextResponse.redirect(
        new URL(`/payment/success?txn=${response.transaction_uuid}`, request.url)
      );
    }

    return NextResponse.redirect(
      new URL(`/payment/error?reason=${verification.status}`, request.url)
    );
  } catch (error) {
    if (error instanceof SignatureError) {
      console.error('⚠️ Signature mismatch — possible tampering!');
      return NextResponse.redirect(new URL('/payment/error?reason=invalid_signature', request.url));
    }
    console.error('Payment verification error:', error);
    return NextResponse.redirect(new URL('/payment/error?reason=verification_failed', request.url));
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: app/api/payment/failure/route.ts — Failure callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET_failure(request: NextRequest) {
  // Redirect to a failure page
  return NextResponse.redirect(new URL('/payment/failed', request.url));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: app/api/webhook/esewa/route.ts — Webhook handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST_webhook(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-esewa-signature') ?? undefined;

    const result = esewa.processWebhookBody(body, signature);

    if (result.isValid && result.payload) {
      // Process the verified webhook
      // await db.order.update({ transactionUuid: result.payload.transaction_uuid, ... });
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE: components/PaymentButton.tsx — Client-side component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/*
'use client';

import { useState } from 'react';

export function PaymentButton({ amount, productId }: { amount: number; productId: string }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      // Call your API to initiate payment
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, productId }),
      });
      const data = await res.json();

      if (data.success) {
        // Create and submit a form dynamically
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.paymentUrl;

        Object.entries(data.formData).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value as string;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
      } else {
        alert('Payment initiation failed: ' + data.error);
        setLoading(false);
      }
    } catch (error) {
      alert('An error occurred');
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePayment} disabled={loading}>
      {loading ? 'Processing...' : `Pay Rs. ${amount} with eSewa`}
    </button>
  );
}
*/
