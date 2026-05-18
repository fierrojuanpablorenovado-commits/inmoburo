import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { createCheckoutSession, isStripeEnabled } from '../services/payments.js';
import { logActivity } from '../services/activity.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { organizationId: req.orgId },
    include: { request: { include: { tenant: true }}},
    orderBy: { createdAt: 'desc' }
  });
  res.json(payments);
});

// Crea sesión de Stripe Checkout (o mock si no hay clave)
router.post('/:id/checkout', async (req, res) => {
  const p = await prisma.payment.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { request: { include: { tenant: true }}}
  });
  if (!p) return res.status(404).json({ error: 'Pago no encontrado' });
  if (p.status === 'paid') return res.status(400).json({ error: 'Pago ya cobrado' });

  const baseUrl = req.headers.origin || `${req.protocol}://${req.get('host')}`;
  const successUrl = `${baseUrl}/app.html#/pagos`;
  const cancelUrl = `${baseUrl}/app.html#/pagos`;

  try {
    const session = await createCheckoutSession({
      payment: p, request: p.request, tenant: p.request?.tenant,
      successUrl, cancelUrl
    });
    res.json({ ...session, stripeEnabled: isStripeEnabled });
  } catch (e) {
    console.error('Checkout error:', e);
    res.status(500).json({ error: 'Error al crear checkout: ' + e.message });
  }
});

// Marcar como pagado manualmente (sin Stripe)
router.post('/:id/charge', async (req, res) => {
  const p = await prisma.payment.findFirst({ where: { id: req.params.id, organizationId: req.orgId }});
  if (!p) return res.status(404).json({ error: 'Pago no encontrado' });
  if (p.status === 'paid') return res.status(400).json({ error: 'Pago ya cobrado' });
  const updated = await prisma.payment.update({
    where: { id: p.id },
    data: { status: 'paid', paidAt: new Date(), reference: 'manual_' + Math.random().toString(36).slice(2,12) }
  });
  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: 'payment.captured', entityType: 'payment', entityId: p.id,
    description: `Pago manual confirmado por <strong>$${p.amount.toLocaleString('es-MX')} MXN</strong>`,
    icon: '💳'
  });
  res.json(updated);
});

export default router;
