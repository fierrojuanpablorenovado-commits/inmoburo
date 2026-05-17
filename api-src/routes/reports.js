import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { generateReportPDF } from '../services/pdf.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { request: { organizationId: req.orgId } },
    include: { request: { include: { tenant: true } } },
    orderBy: { generatedAt: 'desc' }
  });
  res.json(reports);
});

router.get('/:id', async (req, res) => {
  const r = await prisma.report.findFirst({
    where: { id: req.params.id, request: { organizationId: req.orgId }},
    include: { request: { include: { tenant: true }}}
  });
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
  res.json({ ...r, breakdown: r.rawData ? JSON.parse(r.rawData) : null });
});

router.get('/:id/pdf', async (req, res) => {
  const r = await prisma.report.findFirst({
    where: { id: req.params.id, request: { organizationId: req.orgId }},
    include: { request: { include: { tenant: true }}}
  });
  if (!r) return res.status(404).json({ error: 'Reporte no encontrado' });
  const org = await prisma.organization.findUnique({ where: { id: req.orgId }});
  const buffer = await generateReportPDF({
    request: r.request, tenant: r.request.tenant, report: r, organization: org
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="multireporte-${r.id.slice(0,8)}.pdf"`);
  res.send(buffer);
});

export default router;
