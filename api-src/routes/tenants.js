import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const { q } = req.query;
  const tenants = await prisma.tenant.findMany({
    where: {
      organizationId: req.orgId,
      ...(q ? { OR: [
        { fullName: { contains: q } },
        { email: { contains: q } },
        { rfc: { contains: q } }
      ]} : {})
    },
    include: { _count: { select: { requests: true, contracts: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(tenants);
});

router.get('/:id', async (req, res) => {
  const t = await prisma.tenant.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { requests: { orderBy: { createdAt: 'desc' }}, contracts: true }
  });
  if (!t) return res.status(404).json({ error: 'Inquilino no encontrado' });
  res.json(t);
});

router.post('/', async (req, res) => {
  const { fullName, email, phone, rfc, curp, dob, occupation, employer, monthlyIncome, tenure, address } = req.body;
  if (!fullName || !email || !phone) return res.status(400).json({ error: 'Nombre, correo y teléfono requeridos' });
  const t = await prisma.tenant.create({
    data: {
      organizationId: req.orgId,
      fullName, email, phone, rfc, curp, dob, occupation, employer,
      monthlyIncome: monthlyIncome ? parseFloat(monthlyIncome) : null,
      tenure, address
    }
  });
  res.json(t);
});

router.patch('/:id', async (req, res) => {
  const t = await prisma.tenant.findFirst({ where: { id: req.params.id, organizationId: req.orgId }});
  if (!t) return res.status(404).json({ error: 'Inquilino no encontrado' });
  const updated = await prisma.tenant.update({
    where: { id: req.params.id },
    data: { ...req.body, monthlyIncome: req.body.monthlyIncome ? parseFloat(req.body.monthlyIncome) : t.monthlyIncome }
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const t = await prisma.tenant.findFirst({ where: { id: req.params.id, organizationId: req.orgId }});
  if (!t) return res.status(404).json({ error: 'Inquilino no encontrado' });
  await prisma.tenant.delete({ where: { id: req.params.id }});
  res.json({ ok: true });
});

export default router;
