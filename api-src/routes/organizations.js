import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/me', async (req, res) => {
  const o = await prisma.organization.findUnique({
    where: { id: req.orgId },
    include: { _count: { select: { users: true, tenants: true, requests: true, contracts: true, payments: true } } }
  });
  res.json(o);
});

router.patch('/me', requireRole('admin'), async (req, res) => {
  const { name, phone, address, rfc, logoUrl, webhookUrl } = req.body;
  const o = await prisma.organization.update({
    where: { id: req.orgId },
    data: { name, phone, address, rfc, logoUrl, webhookUrl }
  });
  res.json(o);
});

export default router;
