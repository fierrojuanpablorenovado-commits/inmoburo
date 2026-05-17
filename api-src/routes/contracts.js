import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { generateContractPDF } from '../services/pdf.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const contracts = await prisma.contract.findMany({
    where: { organizationId: req.orgId },
    include: { tenant: true, request: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(contracts);
});

router.get('/:id', async (req, res) => {
  const c = await prisma.contract.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { tenant: true, request: true }
  });
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  res.json(c);
});

router.post('/from-request/:requestId', async (req, res) => {
  const request = await prisma.rentalRequest.findFirst({
    where: { id: req.params.requestId, organizationId: req.orgId },
    include: { tenant: true, contract: true }
  });
  if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (request.status !== 'validado') return res.status(400).json({ error: 'Solo solicitudes validadas pueden generar contrato' });
  if (request.contract) return res.status(409).json({ error: 'Esta solicitud ya tiene contrato', contractId: request.contract.id });

  const start = new Date();
  const end = new Date(start); end.setFullYear(end.getFullYear() + 1);

  const contract = await prisma.contract.create({
    data: {
      organizationId: req.orgId,
      requestId: request.id,
      tenantId: request.tenantId,
      startDate: start.toISOString().slice(0,10),
      endDate: end.toISOString().slice(0,10),
      monthlyRent: request.monthlyRent,
      deposit: request.monthlyRent,
      status: 'activo',
      signedAt: new Date(),
      contractData: JSON.stringify({ generatedBy: req.user.id, plan: request.plan })
    },
    include: { tenant: true, request: true }
  });

  if (request.plan !== 'multireporte') {
    await prisma.policy.create({
      data: {
        organizationId: req.orgId,
        requestId: request.id,
        plan: request.plan,
        coverage: request.monthlyRent * 12,
        startDate: contract.startDate,
        endDate: contract.endDate,
        status: 'activa',
        policyNumber: 'POL-' + Date.now().toString().slice(-8)
      }
    });
  }

  const pendingPayment = await prisma.payment.findFirst({
    where: { requestId: request.id, status: 'pending' }
  });
  if (pendingPayment) {
    await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: { status: 'paid', paidAt: new Date(), reference: 'ch_' + Math.random().toString(36).slice(2,12) }
    });
  }

  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: 'contract.signed', entityType: 'contract', entityId: contract.id,
    description: `Contrato firmado para <strong>${request.tenant.fullName}</strong> · ${request.propertyAddress}`,
    icon: '📄'
  });

  res.json(contract);
});

router.get('/:id/pdf', async (req, res) => {
  const c = await prisma.contract.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { tenant: true, request: true }
  });
  if (!c) return res.status(404).json({ error: 'Contrato no encontrado' });
  const org = await prisma.organization.findUnique({ where: { id: req.orgId }});
  const buffer = await generateContractPDF({
    contract: c, request: c.request, tenant: c.tenant, organization: org
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contrato-${c.id.slice(0,8)}.pdf"`);
  res.send(buffer);
});

export default router;
