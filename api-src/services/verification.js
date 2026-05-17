// Mock de verificaciones externas: buró de crédito, listas negras, INE, SAT.
// En producción: integrar con APIs reales (Círculo de Crédito, Buró, INE, SAT).

import { calculateScore } from './scoring.js';

export async function runFullVerification({ tenant, request, documents }) {
  await delay(800); // simula latencia red

  const docsValidated = documents.filter(d => d.status === 'validado').length;
  const scoreData = calculateScore({
    tenant,
    monthlyRent: request.monthlyRent,
    documentsValidated: docsValidated,
    withFiador: request.withFiador
  });

  const observations = [];
  if (scoreData.capacityRatio < 2.5) observations.push('⚠️ Capacidad de pago ajustada (ingreso/renta < 2.5x)');
  if (!scoreData.blacklistOk) observations.push('🚫 Aparece en listas negras nacionales');
  if (!scoreData.legalOk) observations.push('⚠️ Antecedentes legales detectados');
  if (!scoreData.creditOk) observations.push('⚠️ Historial crediticio con observaciones');
  if (scoreData.score >= 80) observations.push('✅ Excelente candidato — perfil financiero sólido');

  return {
    ...scoreData,
    observations: observations.join('\n')
  };
}

const delay = ms => new Promise(r => setTimeout(r, ms));
