# Solventa

> La verdad financiera de tus candidatos.

Plataforma SaaS multi-tenant de análisis crediticio y de solvencia para renta, auto, tarjeta e hipoteca: score explicable, predicción de cumplimiento a 12 meses, contratos profesionales, póliza jurídica y gestión integral del ciclo de crédito.

## Stack

- **Frontend**: HTML/CSS/JS vanilla (carga rápida, sin build step)
- **Backend**: Node.js + Express como Vercel Serverless Function
- **DB**: Postgres (Neon / Supabase / Vercel Postgres)
- **ORM**: Prisma 5
- **Auth**: JWT 7 días + bcrypt
- **PDFs**: PDFKit en memoria (compatible con serverless)
- **Deploy**: Vercel

## Estructura

```
inmoburo/
├── api/index.js          # Vercel serverless handler (envuelve Express)
├── api-src/              # Código del backend
│   ├── server.js
│   ├── routes/           # 12 routers REST
│   ├── services/         # scoring, pdf, payments, notifications, activity
│   ├── middleware/       # auth + roles
│   └── lib/prisma.js
├── prisma/
│   ├── schema.prisma     # 11 modelos multi-tenant (Postgres)
│   └── seed.js           # datos demo
├── public/               # Frontend estático
│   ├── index.html        # Landing
│   ├── app.html          # SPA dashboard
│   └── assets/
├── vercel.json
├── package.json
└── .env.example
```

## Desarrollo local

```bash
git clone https://github.com/<user>/inmoburo
cd inmoburo
npm install

cp .env.example .env.local
# Edita DATABASE_URL apuntando a tu Postgres (Neon free tier: https://neon.tech)

npx prisma db push        # crea las tablas
node prisma/seed.js       # carga datos demo
npm run dev               # http://localhost:4180
```

## Deploy a Vercel — 4 pasos

### 1. Crear Postgres en Neon (gratis, 2 min)
1. Ve a https://neon.tech → New Project → "inmoburo"
2. Copia el `DATABASE_URL` con formato `postgres://...?sslmode=require`

### 2. Importar en Vercel
1. https://vercel.com/new → conecta el repo `inmoburo`
2. En **Environment Variables** agrega:
   - `DATABASE_URL` = (la de Neon)
   - `JWT_SECRET` = corre `openssl rand -hex 32` y pega el resultado
3. Click **Deploy** y espera ~1 min

### 3. Inicializar DB (sólo una vez)
```bash
# Desde tu máquina con .env apuntando a la DB de prod
DATABASE_URL="postgres://..." npx prisma db push
DATABASE_URL="postgres://..." node prisma/seed.js
```

### 4. Conectar dominio Namecheap
1. Compra `solventa.mx` en Namecheap
2. En Vercel → Project Settings → Domains → Add `solventa.mx`
3. En Namecheap → Domain → Advanced DNS:
   - `CNAME` `www` → `cname.vercel-dns.com`
   - `A` `@` → `76.76.21.21`
4. Espera 5-30 min para propagación DNS

## URLs

| URL | Contenido |
|---|---|
| `/` | Landing comercial |
| `/app.html` | SPA panel SaaS |
| `/public/upload/:token` | Liga pública del inquilino |
| `/api/health` | Status del API |

## Credenciales demo (después del seed)

- **Admin**: `jp@solventa.com` / `demo123`
- **Asesor**: `lucia@solventa.com` / `demo123`

## Modelo de datos

```
Organization (tenant) ──┬─→ User       (admin/asesor/viewer)
                        ├─→ Tenant     (inquilinos)
                        └─→ RentalRequest ─┬─→ Document
                                           ├─→ Report   (Multireporte + score)
                                           ├─→ Contract (PDF generado)
                                           ├─→ Policy   (Multiprotección)
                                           └─→ Payment
```

## Algoritmo de score (`api-src/services/scoring.js`)

Base 50 puntos, modificado por 8 factores:
- Capacidad de pago (ingreso/renta): ±25 pts
- Documentos validados: +15 pts
- Identidad completa (RFC/CURP): +8 pts
- Antigüedad laboral: +8 pts
- Fiador: +5 pts
- Crediticio (simulado/buró real): ±12 pts
- Antecedentes legales: -25 pts si falla
- Listas negras (PEP/OFAC/SAT-69-B): -30 pts si falla

Resultado: score 0-100, riesgo `low` / `medium` / `high`.

## Roadmap producción

1. **Storage**: Vercel Blob o Cloudflare R2 (hoy en memoria)
2. **Pagos reales**: Stripe / Conekta / MercadoPago en `services/payments.js`
3. **Notificaciones**: SendGrid (email) + Twilio o ManyChat (WhatsApp)
4. **Verificación**: Círculo de Crédito + RENAPO + SAT-69-B
5. **Firma electrónica**: Mifiel / Weetrust (NOM-151)
6. **Observabilidad**: Sentry + PostHog
7. **API pública**: OpenAPI/Swagger para integrar con socios

## Multi-tenancy

Cada `Organization` es un tenant aislado:
- Todas las queries filtran por `organizationId` (forzado en middleware)
- `apiKey` único por org para integraciones
- `webhookUrl` por org para notificar eventos a sistemas externos
- Plan por org (`free` / `starter` / `pro` / `enterprise`) para feature flags

---

Solventa · Hecho en México · 2026
