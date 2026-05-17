// Mock de cobros tipo Stripe. En producción: integrar con Stripe / Conekta / MercadoPago.

import prisma from '../lib/prisma.js';

const PLAN_PRICES = {
  multireporte: 999,
  multiproteccion: 4600,
  premium: 7500
};
const FIADOR_FEE = 299;
const CORPORATE_FEE = 200;

export function calculatePrice({ plan, withFiador, withCorporate, rent }) {
  let amount = PLAN_PRICES[plan] || 0;
  if (withFiador) amount += FIADOR_FEE;
  if (withCorporate) amount += CORPORATE_FEE;
  // Excedente 10% sobre renta > $100,000 (solo para protección)
  if (plan !== 'multireporte' && rent > 100000) {
    amount += Math.round((rent - 100000) * 0.10);
  }
  return amount;
}

export async function createCharge({ orgId, requestId, concept, amount, method = 'card' }) {
  const reference = 'ch_' + Math.random().toString(36).slice(2, 14);
  // 95% éxito simulado
  const success = Math.random() > 0.05;
  return prisma.payment.create({
    data: {
      organizationId: orgId,
      requestId,
      concept,
      amount,
      method,
      status: success ? 'paid' : 'failed',
      reference,
      paidAt: success ? new Date() : null
    }
  });
}
