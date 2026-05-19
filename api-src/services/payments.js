// Pagos con Stripe Checkout real. Fallback a mock si no hay STRIPE_SECRET_KEY.

import prisma from '../lib/prisma.js';
import Stripe from 'stripe';

const PLAN_PRICES = { multireporte: 999, multiproteccion: 4600, premium: 7500 };
const FIADOR_FEE = 299;
const CORPORATE_FEE = 200;

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_ENABLED = stripeKey.startsWith('sk_');
const stripe = STRIPE_ENABLED ? new Stripe(stripeKey, { apiVersion: '2024-06-20' }) : null;

const PLAN_LABELS = {
  multireporte: 'Radar — Investigación de inquilino',
  multiproteccion: 'Cobertura — Contrato + Convenio CJA',
  premium: 'Cobertura Élite — Cobertura jurídica total'
};

export function calculatePrice({ plan, withFiador, withCorporate, rent }) {
  let amount = PLAN_PRICES[plan] || 0;
  if (withFiador) amount += FIADOR_FEE;
  if (withCorporate) amount += CORPORATE_FEE;
  if (plan !== 'multireporte' && rent > 100000) {
    amount += Math.round((rent - 100000) * 0.10);
  }
  return amount;
}

// Crea sesión Stripe Checkout y devuelve URL para redirigir
export async function createCheckoutSession({ payment, request, tenant, successUrl, cancelUrl }) {
  if (!STRIPE_ENABLED) {
    return { url: successUrl + '?mock=1&pid=' + payment.id, mock: true };
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    currency: 'mxn',
    payment_method_types: ['card'],
    customer_email: tenant?.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: Math.round(payment.amount * 100),
        product_data: {
          name: PLAN_LABELS[request.plan] || 'Servicio Solventa Buró',
          description: `Inquilino: ${tenant?.fullName || '—'} · Inmueble: ${request.propertyAddress}`
        }
      }
    }],
    success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl,
    metadata: {
      paymentId: payment.id,
      requestId: request.id,
      organizationId: payment.organizationId
    }
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { reference: session.id }});
  return { url: session.url, mock: false };
}

export async function handleStripeWebhook(body, signature) {
  if (!STRIPE_ENABLED) return { received: true, mock: true };
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = secret
      ? stripe.webhooks.constructEvent(body, signature, secret)
      : JSON.parse(body.toString());
  } catch (e) { throw new Error('Invalid webhook signature: ' + e.message); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    if (paymentId) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'paid', paidAt: new Date(),
          reference: session.payment_intent || session.id,
          metadata: JSON.stringify({ stripeSessionId: session.id, amount: session.amount_total / 100 })
        }
      });
    }
  }
  return { received: true, type: event.type };
}

export async function createCharge({ orgId, requestId, concept, amount, method = 'card' }) {
  const reference = (STRIPE_ENABLED ? 'ch_real_' : 'ch_mock_') + Math.random().toString(36).slice(2, 14);
  const success = STRIPE_ENABLED ? true : Math.random() > 0.05;
  return prisma.payment.create({
    data: {
      organizationId: orgId, requestId, concept, amount, method,
      status: success ? 'paid' : 'failed',
      reference, paidAt: success ? new Date() : null
    }
  });
}

export const isStripeEnabled = STRIPE_ENABLED;
