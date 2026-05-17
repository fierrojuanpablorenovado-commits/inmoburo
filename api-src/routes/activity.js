import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10);
  const items = await prisma.activity.findMany({
    where: { organizationId: req.orgId },
    include: { user: { select: { name: true }}},
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  res.json(items);
});

export default router;
