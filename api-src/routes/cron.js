import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { sendEmail, sendWhatsApp } from '../services/notifications.js';

const router = Router();

const CRON_SECRET = process.env.CRON_SECRET || '';

function cronAuth(req, res, next) {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Cron: recordatorio 24h a inquilinos sin documentos
// Vercel Cron: cada hora — 0 * * * *
router.get('/recordatorio-documentos', cronAuth, async (req, res) => {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Solicitudes creadas entre 24h y 48h atrás, en estado 'nuevo', sin ningún documento
  const pendientes = await prisma.rentalRequest.findMany({
    where: {
      createdAt: { gte: hace48h, lte: hace24h },
      status: 'nuevo',
      documents: { none: {} }
    },
    include: { tenant: true, organization: true }
  });

  let sent = 0;
  const errors = [];

  for (const request of pendientes) {
    const { tenant, organization } = request;
    if (!tenant) continue;

    const baseUrl = process.env.APP_URL || 'https://solventaburo.vercel.app';
    const publicUrl = `${baseUrl}/public/upload/${request.id}`;

    try {
      // Email de recordatorio
      if (tenant.email) {
        await sendEmail({
          orgId: request.organizationId,
          to: tenant.email,
          subject: '📄 Recordatorio: completa tu solicitud — Solventa Buró',
          body: `<p>Hola <strong>${tenant.fullName}</strong>,</p>
<p>Notamos que aún no has subido tus documentos para la solicitud del inmueble <strong>${request.propertyAddress}</strong>.</p>
<p>El proceso tarda menos de 5 minutos. Solo necesitas subir tu identificación y comprobantes de ingreso.</p>
<p>Sin registro, sin descargas. Tus documentos quedan cifrados.</p>`,
          ctaText: 'Subir mis documentos →',
          ctaUrl: publicUrl,
          metadata: { trigger: 'cron_recordatorio_24h', requestId: request.id }
        });
      }

      // WhatsApp si tiene teléfono
      if (tenant.phone) {
        await sendWhatsApp({
          orgId: request.organizationId,
          to: tenant.phone,
          body: `¡Hola ${tenant.fullName}! 👋\n\nTe recordamos que aún no has subido tus documentos para el inmueble ${request.propertyAddress}.\n\nComplétalos aquí (rápido, sin registro):\n${publicUrl}\n\nSolventa Buró · La verdad financiera de tus candidatos.`,
          metadata: { trigger: 'cron_recordatorio_24h', requestId: request.id }
        });
      }

      sent++;
    } catch (e) {
      console.error(`[CRON] Error enviando recordatorio a ${tenant.email}:`, e.message);
      errors.push({ requestId: request.id, error: e.message });
    }
  }

  res.json({
    checked: pendientes.length,
    remindersSent: sent,
    errors: errors.length ? errors : undefined
  });
});

export default router;
