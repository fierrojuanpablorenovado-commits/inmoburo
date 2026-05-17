import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { runFullVerification } from '../services/verification.js';
import { notifyTenantDocumentLink } from '../services/notifications.js';
import { calculatePrice, createCharge } from '../services/payments.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const { status, q } = req.query;
  const requests = await prisma.rentalRequest.findMany({
    where: {
      organizationId: req.orgId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(q ? { OR: [
        { propertyAddress: { contains: q } },
        { tenant: { fullName: { contains: q }}}
      ]} : {})
    },
    include: {
      tenant: true,
      report: true,
      _count: { select: { documents: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(requests);
});

router.get('/:id', async (req, res) => {
  const r = await prisma.rentalRequest.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: {
      tenant: true,
      documents: { orderBy: { uploadedAt: 'desc' }},
      report: true,
      contract: true,
      policy: true,
      payments: true,
      createdBy: { select: { id: true, name: true, email: true }}
    }
  });
  if (!r) return res.status(404).json({ error: 'Solicitud no encontrada' });
  res.json(r);
});

router.post('/', async (req, res) => {
  const { tenantData, propertyAddress, monthlyRent, plan, withFiador, withCorporate } = req.body;
  if (!tenantData?.fullName || !tenantData?.email || !propertyAddress || !monthlyRent || !plan) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  // Crear o reutilizar inquilino
  let tenant = await prisma.tenant.findFirst({
    where: { organizationId: req.orgId, email: tenantData.email }
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        organizationId: req.orgId,
        fullName: tenantData.fullName,
        email: tenantData.email,
        phone: tenantData.phone || '',
        rfc: tenantData.rfc, curp: tenantData.curp,
        occupation: tenantData.occupation,
        employer: tenantData.employer,
        monthlyIncome: tenantData.monthlyIncome ? parseFloat(tenantData.monthlyIncome) : null,
        tenure: tenantData.tenure
      }
    });
  }

  const request = await prisma.rentalRequest.create({
    data: {
      organizationId: req.orgId,
      tenantId: tenant.id,
      createdById: req.user.id,
      propertyAddress,
      monthlyRent: parseFloat(monthlyRent),
      plan,
      withFiador: !!withFiador,
      withCorporate: !!withCorporate,
      progress: 15
    },
    include: { tenant: true }
  });

  // Crear pago pendiente
  const amount = calculatePrice({ plan, withFiador, withCorporate, rent: parseFloat(monthlyRent) });
  await prisma.payment.create({
    data: {
      organizationId: req.orgId,
      requestId: request.id,
      concept: `${plan} · ${tenant.fullName}`,
      amount,
      method: 'card',
      status: 'pending'
    }
  });

  // Notificar al inquilino (mock)
  const publicUrl = `${req.protocol}://${req.get('host')}/public/upload/${request.publicToken}`;
  await notifyTenantDocumentLink({ orgId: req.orgId, tenant, request, publicUrl });

  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: 'request.created', entityType: 'request', entityId: request.id,
    description: `Solicitud creada para <strong>${tenant.fullName}</strong> · ${propertyAddress}`,
    icon: '📋'
  });

  res.json({ request, amount, publicUrl });
});

router.patch('/:id/advance', async (req, res) => {
  const r = await prisma.rentalRequest.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { tenant: true, documents: true }
  });
  if (!r) return res.status(404).json({ error: 'No encontrada' });

  const flow = ['nuevo', 'revision', 'validado'];
  const i = flow.indexOf(r.status);
  if (i < 0 || i >= flow.length - 1) {
    return res.status(400).json({ error: `No se puede avanzar desde estado ${r.status}` });
  }

  const nextStatus = flow[i + 1];
  let progress = Math.min(100, r.progress + 35);
  let scoreCreated = null;

  if (nextStatus === 'validado') {
    // Marcar todos los docs como validados (demo)
    await prisma.document.updateMany({
      where: { requestId: r.id, status: 'revision' },
      data: { status: 'validado', reviewedAt: new Date() }
    });

    const docs = await prisma.document.findMany({ where: { requestId: r.id }});
    const verification = await runFullVerification({ tenant: r.tenant, request: r, documents: docs });

    scoreCreated = await prisma.report.upsert({
      where: { requestId: r.id },
      create: {
        requestId: r.id,
        score: verification.score,
        identityOk: verification.identityOk,
        creditOk: verification.creditOk,
        legalOk: verification.legalOk,
        blacklistOk: verification.blacklistOk,
        fraudRisk: verification.fraudRisk,
        capacityRatio: verification.capacityRatio,
        observations: verification.observations,
        rawData: JSON.stringify(verification)
      },
      update: {
        score: verification.score,
        identityOk: verification.identityOk,
        creditOk: verification.creditOk,
        legalOk: verification.legalOk,
        blacklistOk: verification.blacklistOk,
        fraudRisk: verification.fraudRisk,
        capacityRatio: verification.capacityRatio,
        observations: verification.observations,
        rawData: JSON.stringify(verification)
      }
    });

    progress = 100;
    // PDFs se generan on-demand desde /api/reports/:id/pdf — no persisten en disco (Vercel serverless)
  }

  const updated = await prisma.rentalRequest.update({
    where: { id: r.id },
    data: { status: nextStatus, progress, validatedAt: nextStatus === 'validado' ? new Date() : null },
    include: { tenant: true, report: true }
  });

  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: `request.${nextStatus}`, entityType: 'request', entityId: r.id,
    description: scoreCreated
      ? `<strong>${r.tenant.fullName}</strong> validado con score <strong>${scoreCreated.score}</strong>`
      : `Solicitud de <strong>${r.tenant.fullName}</strong> avanzó a ${nextStatus}`,
    icon: nextStatus === 'validado' ? '✅' : '🔄'
  });

  res.json(updated);
});

router.patch('/:id/reject', async (req, res) => {
  const { reason } = req.body;
  const r = await prisma.rentalRequest.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { tenant: true }
  });
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  const updated = await prisma.rentalRequest.update({
    where: { id: r.id },
    data: { status: 'rechazado', progress: 100 }
  });
  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: 'request.rejected', entityType: 'request', entityId: r.id,
    description: `<strong>${r.tenant.fullName}</strong> rechazado${reason?': '+reason:''}`,
    icon: '❌'
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const r = await prisma.rentalRequest.findFirst({ where: { id: req.params.id, organizationId: req.orgId }});
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  await prisma.rentalRequest.delete({ where: { id: r.id }});
  res.json({ ok: true });
});

export default router;
