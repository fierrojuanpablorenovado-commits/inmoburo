import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { organizationId: req.orgId },
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, lastLoginAt: true, createdAt: true }
  });
  res.json(users);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, role = 'asesor', phone, password = 'TempPass123' } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Nombre y correo requeridos' });
  const existing = await prisma.user.findUnique({ where: { email }});
  if (existing) return res.status(409).json({ error: 'Este correo ya existe' });
  const u = await prisma.user.create({
    data: {
      name, email, role, phone,
      passwordHash: await bcrypt.hash(password, 10),
      organizationId: req.orgId
    }
  });
  await logActivity({
    orgId: req.orgId, userId: req.user.id,
    action: 'user.invited', entityType: 'user', entityId: u.id,
    description: `Usuario <strong>${name}</strong> invitado como ${role}`,
    icon: '👤'
  });
  res.json({ id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone, temporaryPassword: password });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: req.params.id, organizationId: req.orgId }});
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const updated = await prisma.user.update({
    where: { id: u.id },
    data: { name: req.body.name, email: req.body.email || u.email, role: req.body.role, phone: req.body.phone, active: req.body.active }
  });
  res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active });
});

export default router;
