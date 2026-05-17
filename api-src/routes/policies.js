import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const policies = await prisma.policy.findMany({
    where: { organizationId: req.orgId },
    include: { request: { include: { tenant: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(policies);
});

router.get('/:id', async (req, res) => {
  const p = await prisma.policy.findFirst({
    where: { id: req.params.id, organizationId: req.orgId },
    include: { request: { include: { tenant: true }}}
  });
  if (!p) return res.status(404).json({ error: 'Póliza no encontrada' });
  res.json(p);
});

export default router;
