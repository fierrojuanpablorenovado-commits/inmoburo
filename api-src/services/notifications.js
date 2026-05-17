// Mock de envíos. En producción: SendGrid/Resend para email, Twilio/ManyChat para WhatsApp.

import prisma from '../lib/prisma.js';

export async function sendEmail({ orgId, to, subject, body, metadata }) {
  console.log(`[EMAIL → ${to}] ${subject}`);
  return prisma.notification.create({
    data: {
      organizationId: orgId,
      channel: 'email',
      recipient: to,
      subject,
      body,
      status: 'sent',
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

export async function sendWhatsApp({ orgId, to, body, metadata }) {
  console.log(`[WHATSAPP → ${to}] ${body.slice(0,60)}...`);
  return prisma.notification.create({
    data: {
      organizationId: orgId,
      channel: 'whatsapp',
      recipient: to,
      subject: 'WhatsApp',
      body,
      status: 'sent',
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}

export async function notifyTenantDocumentLink({ orgId, tenant, request, publicUrl }) {
  const body = `Hola ${tenant.fullName}, tu asesor inmobiliario te invita a completar tu solicitud de renta. Sube tus documentos aquí: ${publicUrl}`;
  await sendEmail({ orgId, to: tenant.email, subject: '📋 Completa tu solicitud de renta — InmoBuró', body });
  if (tenant.phone) await sendWhatsApp({ orgId, to: tenant.phone, body });
}
