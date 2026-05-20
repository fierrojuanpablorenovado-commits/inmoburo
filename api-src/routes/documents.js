import { Router } from 'express';
import multer from 'multer';
import { put } from '@vercel/blob';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { runFullVerification } from '../services/verification.js';

const router = Router();

// En serverless usamos memoria. Para producción real: enviar a Vercel Blob / S3 / R2.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Public endpoint: inquilino sube documentos con publicToken
router.post('/public/:token/upload', upload.single('file'), async (req, res) => {
  const { token } = req.params;
  const { type } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const request = await prisma.rentalRequest.findUnique({ where: { publicToken: token }, include: { tenant: true }});
  if (!request) return res.status(404).json({ error: 'Solicitud no válida' });

  // CAMBIO 2: Verificar que el token no haya expirado (7 días)
  const daysSinceCreation = (Date.now() - new Date(request.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation > 7) {
    return res.status(410).json({ error: 'Esta liga de documentos ha expirado. Contacta a tu asesor.' });
  }

  // CAMBIO 1: Subir a Vercel Blob en lugar de guardar en filesystem local
  const ext = req.file.originalname.split('.').pop() || 'bin';
  const blobPath = `docs/${request.id}/${type || 'otro'}-${Date.now()}.${ext}`;
  const { url: blobUrl } = await put(blobPath, req.file.buffer, {
    access: 'private',
    contentType: req.file.mimetype
  });

  const doc = await prisma.document.create({
    data: {
      requestId: request.id,
      type: type || 'otro',
      filename: req.file.originalname,
      storagePath: blobUrl,
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'revision'
    }
  });

  const updatedRequest = await prisma.rentalRequest.update({
    where: { id: request.id },
    data: { progress: Math.min(80, request.progress + 10), status: request.status === 'nuevo' ? 'revision' : request.status }
  });

  await logActivity({
    orgId: request.organizationId,
    action: 'document.uploaded', entityType: 'document', entityId: doc.id,
    description: `<strong>${request.tenant.fullName}</strong> subió ${type || 'documento'}`,
    icon: '📎'
  });

  // CAMBIO 3: Auto-análisis cuando se suben 6 o más documentos
  const docCount = await prisma.document.count({
    where: { requestId: request.id, status: { not: 'rechazado' } }
  });

  if (docCount >= 6 && updatedRequest.status === 'revision') {
    setImmediate(async () => {
      try {
        const docs = await prisma.document.findMany({ where: { requestId: request.id } });
        const verification = await runFullVerification({ tenant: request.tenant, request, documents: docs });
        await prisma.report.upsert({
          where: { requestId: request.id },
          create: {
            requestId: request.id,
            score: verification.score,
            identityOk: verification.identityOk,
            creditOk: verification.creditOk,
            legalOk: verification.legalOk,
            blacklistOk: verification.blacklistOk,
            fraudRisk: verification.fraudRisk,
            capacityRatio: verification.capacityRatio,
            observations: verification.observations,
            rawData: JSON.stringify(verification)
          },
          update: {
            score: verification.score,
            identityOk: verification.identityOk,
            creditOk: verification.creditOk,
            legalOk: verification.legalOk,
            blacklistOk: verification.blacklistOk,
            fraudRisk: verification.fraudRisk,
            capacityRatio: verification.capacityRatio,
            observations: verification.observations,
            rawData: JSON.stringify(verification)
          }
        });
        await logActivity({
          orgId: request.organizationId,
          action: 'request.auto_verified', entityType: 'request', entityId: request.id,
          description: `Auto-análisis completado para <strong>${request.tenant.fullName}</strong> · score ${verification.score}`,
          icon: '🤖'
        });
      } catch (e) {
        console.error('Auto-verification failed:', e.message);
      }
    });
  }

  res.json({ ok: true, document: { id: doc.id, type: doc.type, filename: doc.filename }});
});

// Asesor: ver/validar documentos
router.use(authRequired);

router.get('/request/:requestId', async (req, res) => {
  const r = await prisma.rentalRequest.findFirst({ where: { id: req.params.requestId, organizationId: req.orgId }});
  if (!r) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const docs = await prisma.document.findMany({ where: { requestId: r.id }, orderBy: { uploadedAt: 'desc' }});
  res.json(docs);
});

router.patch('/:id', async (req, res) => {
  const { status, notes } = req.body;
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, request: { organizationId: req.orgId }}
  });
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { status, notes, reviewedAt: new Date() }
  });
  res.json(updated);
});

export default router;
