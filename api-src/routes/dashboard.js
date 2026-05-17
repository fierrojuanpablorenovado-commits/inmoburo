import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/stats', async (req, res) => {
  const orgId = req.orgId;
  const [totalReq, validated, rejected, inReview, activeContracts, paidPayments, pendingPayments, totalTenants, reports] = await Promise.all([
    prisma.rentalRequest.count({ where: { organizationId: orgId }}),
    prisma.rentalRequest.count({ where: { organizationId: orgId, status: 'validado' }}),
    prisma.rentalRequest.count({ where: { organizationId: orgId, status: 'rechazado' }}),
    prisma.rentalRequest.count({ where: { organizationId: orgId, status: 'revision' }}),
    prisma.contract.count({ where: { organizationId: orgId, status: 'activo' }}),
    prisma.payment.aggregate({ where: { organizationId: orgId, status: 'paid' }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { organizationId: orgId, status: 'pending' }, _sum: { amount: true }, _count: true }),
    prisma.tenant.count({ where: { organizationId: orgId }}),
    prisma.report.findMany({ where: { request: { organizationId: orgId }}, select: { score: true }})
  ]);

  const avgScore = reports.length ? Math.round(reports.reduce((s,r)=>s+r.score,0)/reports.length) : 0;

  // Distribución de scores
  const distribution = { excellent: 0, good: 0, average: 0, poor: 0 };
  reports.forEach(r => {
    if (r.score >= 80) distribution.excellent++;
    else if (r.score >= 65) distribution.good++;
    else if (r.score >= 50) distribution.average++;
    else distribution.poor++;
  });

  res.json({
    requests: { total: totalReq, validated, rejected, inReview, validationRate: totalReq ? Math.round(validated/totalReq*100) : 0 },
    contracts: { active: activeContracts },
    tenants: { total: totalTenants },
    revenue: {
      paid: paidPayments._sum.amount || 0,
      paidCount: paidPayments._count,
      pending: pendingPayments._sum.amount || 0,
      pendingCount: pendingPayments._count
    },
    scoring: { avg: avgScore, totalReports: reports.length, distribution }
  });
});

router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  if (q.length < 2) return res.json({ tenants: [], requests: [], contracts: [] });
  const [tenants, requests, contracts] = await Promise.all([
    prisma.tenant.findMany({
      where: { organizationId: req.orgId, OR: [
        { fullName: { contains: q }}, { email: { contains: q }}, { rfc: { contains: q }}
      ]}, take: 5
    }),
    prisma.rentalRequest.findMany({
      where: { organizationId: req.orgId, OR: [
        { propertyAddress: { contains: q }},
        { tenant: { fullName: { contains: q }}}
      ]}, include: { tenant: true }, take: 5
    }),
    prisma.contract.findMany({
      where: { organizationId: req.orgId, tenant: { fullName: { contains: q }}},
      include: { tenant: true }, take: 5
    })
  ]);
  res.json({ tenants, requests, contracts });
});

export default router;
