import { Router } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

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

  // Demo: persistimos sólo metadata. En producción: subir buffer a Vercel Blob/S3 y guardar URL.
  const doc = await prisma.document.create({
    data: {
      requestId: request.id,
      type: type || 'otro',
      filename: req.file.originalname,
      storagePath: 'memory://' + Date.now(),
      mimeType: req.file.mimetype,
      size: req.file.size,
      status: 'revision'
    }
  });

  await prisma.rentalRequest.update({
    where: { id: request.id },
    data: { progress: Math.min(80, request.progress + 10), status: request.status === 'nuevo' ? 'revision' : request.status }
  });

  await logActivity({
    orgId: request.organizationId,
    action: 'document.uploaded', entityType: 'document', entityId: doc.id,
    description: `<strong>${request.tenant.fullName}</strong> subió ${type || 'documento'}`,
    icon: '📎'
  });

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
