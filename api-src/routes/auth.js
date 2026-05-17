import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  company: z.string().min(2),
  phone: z.string().optional()
});

router.post('/signup', async (req, res) => {
  try {
    const data = signupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Este correo ya está registrado' });

    const slug = data.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2,6);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const org = await prisma.organization.create({
      data: {
        name: data.company,
        slug,
        plan: 'starter',
        users: {
          create: {
            email: data.email,
            passwordHash,
            name: data.name,
            phone: data.phone,
            role: 'admin'
          }
        }
      },
      include: { users: true }
    });

    const user = org.users[0];
    const token = signToken({ userId: user.id, orgId: org.id });

    await logActivity({
      orgId: org.id, userId: user.id,
      action: 'org.created', entityType: 'organization', entityId: org.id,
      description: `Organización <strong>${org.name}</strong> creada por ${user.name}`,
      icon: '🏢'
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
      organization: { id: org.id, name: org.name, slug: org.slug, plan: org.plan }
    });
  } catch (e) {
    if (e.errors) return res.status(400).json({ error: 'Datos inválidos', details: e.errors });
    console.error(e);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Credenciales requeridas' });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true }
    });
    if (!user || !user.active) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken({ userId: user.id, orgId: user.organizationId });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
      organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, phone: req.user.phone },
    organization: { id: req.user.organization.id, name: req.user.organization.name, slug: req.user.organization.slug, plan: req.user.organization.plan, logoUrl: req.user.organization.logoUrl }
  });
});

router.patch('/me', authRequired, async (req, res) => {
  const { name, phone } = req.body;
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { name, phone }
  });
  res.json({ user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, phone: updated.phone } });
});

export default router;
