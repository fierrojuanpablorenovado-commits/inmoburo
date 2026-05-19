// Notificaciones reales: Resend (email) + Meta WhatsApp Cloud API. Fallback a log si no hay credenciales.

import prisma from '../lib/prisma.js';
import { Resend } from 'resend';

const resendKey = process.env.RESEND_API_KEY || '';
const RESEND_ENABLED = resendKey.startsWith('re_');
const resend = RESEND_ENABLED ? new Resend(resendKey) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Solventa <onboarding@resend.dev>';

const WA_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const WA_ENABLED = !!(WA_TOKEN && WA_PHONE_ID);

const NAVY = '#1e1b4b';
const LIME = '#a3e635';

function emailTemplate({ heading, body, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4">
    <div style="background:${NAVY};padding:24px 32px;color:white">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:-.5px">
        <span style="display:inline-block;width:32px;height:32px;background:${LIME};border-radius:9px;text-align:center;line-height:32px;color:${NAVY};font-weight:900;margin-right:8px;vertical-align:middle">●</span>
        Solventa
      </div>
    </div>
    <div style="padding:36px 32px;color:#292524">
      <h1 style="font-size:24px;font-weight:700;letter-spacing:-.5px;margin:0 0 16px;color:${NAVY}">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#44403c">${body}</div>
      ${ctaUrl ? `<div style="margin-top:28px"><a href="${ctaUrl}" style="display:inline-block;background:${LIME};color:${NAVY};padding:14px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">${ctaText}</a></div>`:''}
    </div>
    <div style="padding:20px 32px;background:#fafaf9;border-top:1px solid #e7e5e4;color:#78716c;font-size:12px;line-height:1.6">
      Solventa · Hecho en México · <a href="https://solventa.vercel.app" style="color:#3b3691">solventa.com</a><br>
      La verdad financiera de tus candidatos.
    </div>
  </div>
</body></html>`;
}

export async function sendEmail({ orgId, to, subject, body, html, ctaText, ctaUrl, metadata }) {
  const heading = subject.replace(/^📋|📄|✅|🚫|⚡|🛡️/g, '').trim();
  const finalHtml = html || emailTemplate({ heading, body, ctaText, ctaUrl });
  let status = 'sent';
  let errorMsg = null;

  if (RESEND_ENABLED) {
    try {
      const r = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html: finalHtml
      });
      if (r.error) { status = 'failed'; errorMsg = r.error.message; }
    } catch (e) {
      status = 'failed'; errorMsg = e.message;
      console.error('[EMAIL ERROR]', e.message);
    }
  } else {
    console.log(`[EMAIL MOCK → ${to}] ${subject}`);
  }

  return prisma.notification.create({
    data: {
      organizationId: orgId, channel: 'email', recipient: to, subject, body,
      status,
      metadata: JSON.stringify({ ...(metadata||{}), errorMsg, provider: RESEND_ENABLED ? 'resend' : 'mock' })
    }
  });
}

export async function sendWhatsApp({ orgId, to, body, metadata }) {
  // Normaliza número (debe ser sin +, sin espacios)
  const phone = (to || '').replace(/[^\d]/g, '');
  let status = 'sent';
  let errorMsg = null;

  if (WA_ENABLED && phone) {
    try {
      const url = `https://graph.facebook.com/v20.0/${WA_PHONE_ID}/messages`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body }
        })
      });
      if (!r.ok) {
        status = 'failed';
        const e = await r.text();
        errorMsg = e.slice(0, 200);
        console.error('[WA ERROR]', errorMsg);
      }
    } catch (e) { status = 'failed'; errorMsg = e.message; console.error('[WA ERROR]', e.message); }
  } else {
    console.log(`[WHATSAPP MOCK → ${phone}] ${body.slice(0,60)}...`);
  }

  return prisma.notification.create({
    data: {
      organizationId: orgId, channel: 'whatsapp', recipient: phone || to,
      subject: 'WhatsApp', body, status,
      metadata: JSON.stringify({ ...(metadata||{}), errorMsg, provider: WA_ENABLED ? 'meta-cloud' : 'mock' })
    }
  });
}

export async function notifyTenantDocumentLink({ orgId, tenant, request, publicUrl }) {
  const body = `<p>Hola <strong>${tenant.fullName}</strong>,</p>
<p>Tu asesor inmobiliario te invita a completar tu solicitud de renta del inmueble <strong>${request.propertyAddress}</strong>.</p>
<p>El proceso es rápido y 100% digital. Solo necesitas subir 6 documentos:</p>
<ul style="margin:14px 0 0;padding-left:18px;color:#44403c">
  <li>Identificación oficial (INE / Pasaporte)</li>
  <li>Comprobante de domicilio</li>
  <li>Comprobantes de ingresos (últimos 3 meses)</li>
  <li>Estado de cuenta bancario</li>
  <li>Constancia de empleo</li>
  <li>Referencias personales</li>
</ul>
<p style="margin-top:18px">Sin registro, sin descargas. Tus documentos quedan cifrados.</p>`;
  await sendEmail({
    orgId,
    to: tenant.email,
    subject: '📋 Completa tu solicitud — Solventa',
    body,
    ctaText: 'Subir mis documentos →',
    ctaUrl: publicUrl
  });
  if (tenant.phone) {
    await sendWhatsApp({
      orgId, to: tenant.phone,
      body: `¡Hola ${tenant.fullName}! 👋\n\nTu asesor te invita a completar tu solicitud para el inmueble ${request.propertyAddress}.\n\nSube tus documentos aquí (es rápido, sin registro):\n${publicUrl}\n\nSolventa · La verdad financiera de tus candidatos.`
    });
  }
}

export async function notifyScoreReady({ orgId, asesor, tenant, score, requestId, baseUrl }) {
  const url = `${baseUrl}/app.html#/solicitud/${requestId}`;
  const body = `<p>El Multireporte de <strong>${tenant.fullName}</strong> está listo.</p>
<p style="margin:18px 0;padding:18px;background:#ecfccb;border-radius:10px;border-left:4px solid ${LIME}">
  <strong style="font-size:24px;color:${NAVY}">Score: ${score}/100</strong><br>
  <span style="color:#44403c;font-size:14px">${score >= 80 ? '✅ Excelente candidato' : score >= 60 ? '⚠️ Candidato aceptable' : '❌ Alto riesgo'}</span>
</p>
<p>Revisa el detalle completo y los 8 factores del análisis en tu panel.</p>`;
  return sendEmail({
    orgId, to: asesor.email,
    subject: `🎯 Score listo: ${tenant.fullName} — ${score}/100`,
    body,
    ctaText: 'Ver Multireporte →', ctaUrl: url
  });
}

export const isResendEnabled = RESEND_ENABLED;
export const isWhatsAppEnabled = WA_ENABLED;
