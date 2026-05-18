import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth.js';
import organizationsRouter from './routes/organizations.js';
import usersRouter from './routes/users.js';
import tenantsRouter from './routes/tenants.js';
import requestsRouter from './routes/requests.js';
import documentsRouter from './routes/documents.js';
import reportsRouter from './routes/reports.js';
import contractsRouter from './routes/contracts.js';
import policiesRouter from './routes/policies.js';
import paymentsRouter from './routes/payments.js';
import activityRouter from './routes/activity.js';
import dashboardRouter from './routes/dashboard.js';
import { handleStripeWebhook, isStripeEnabled } from './services/payments.js';
import { isResendEnabled, isWhatsAppEnabled } from './services/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4180;

app.use(cors());

// Stripe webhook: necesita raw body antes de express.json
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await handleStripeWebhook(req.body, req.headers['stripe-signature']);
    res.json(result);
  } catch (e) {
    console.error('Stripe webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({
  ok: true, app: 'inmoburo', version: '1.0.0', time: new Date().toISOString(),
  integrations: { stripe: isStripeEnabled, email: isResendEnabled, whatsapp: isWhatsAppEnabled }
}));
app.use('/api/auth', authRouter);
app.use('/api/organization', organizationsRouter);
app.use('/api/users', usersRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/dashboard', dashboardRouter);

// Static frontend (en local dev). En Vercel, los estáticos los sirve la plataforma desde /public.
const PUBLIC_DIR = path.resolve(__dirname, '../public');
if (!process.env.VERCEL) {
  app.use(express.static(PUBLIC_DIR));
  app.get('/public/upload/:token', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'public-upload.html')));
  app.get(['/app', '/app/*'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));
}

// 404 (sólo para /api/*; estáticos los maneja Vercel o express.static arriba)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

// Sólo escucha en local. En Vercel, el handler está en /api/index.js
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 InmoBuró SaaS running on http://localhost:${PORT}`);
    console.log(`📊 API:      http://localhost:${PORT}/api`);
    console.log(`🌐 Landing:  http://localhost:${PORT}/`);
    console.log(`💼 App:      http://localhost:${PORT}/app.html`);
  });
}

export default app;
