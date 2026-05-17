import prisma from '../lib/prisma.js';

export async function logActivity({ orgId, userId, action, entityType, entityId, description, icon, metadata }) {
  return prisma.activity.create({
    data: {
      organizationId: orgId,
      userId: userId || null,
      action, entityType, entityId,
      description, icon: icon || '📌',
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}
