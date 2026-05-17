// Algoritmo de score de confiabilidad
// Combina factores: identidad, ingreso vs renta, historial crediticio simulado,
// antecedentes legales, listas negras, antigüedad laboral.

export function calculateScore({ tenant, monthlyRent, documentsValidated, withFiador }) {
  let score = 50; // base

  // Capacidad de pago: ratio ingreso/renta
  const income = tenant.monthlyIncome || 0;
  const ratio = monthlyRent > 0 ? income / monthlyRent : 0;
  let capacityPoints = 0;
  if (ratio >= 4) capacityPoints = 25;
  else if (ratio >= 3) capacityPoints = 20;
  else if (ratio >= 2.5) capacityPoints = 12;
  else if (ratio >= 2) capacityPoints = 5;
  else capacityPoints = -10;
  score += capacityPoints;

  // Documentos validados (cada doc validado suma)
  score += Math.min(15, documentsValidated * 3);

  // Identidad y RFC válidos (simulado)
  if (tenant.rfc && tenant.rfc.length === 13) score += 5;
  if (tenant.curp && tenant.curp.length === 18) score += 3;

  // Antigüedad laboral
  const tenureYears = parseInt((tenant.tenure || '0').match(/\d+/)?.[0] || '0', 10);
  if (tenureYears >= 5) score += 8;
  else if (tenureYears >= 2) score += 4;
  else if (tenureYears >= 1) score += 1;
  else score -= 3;

  // Fiador adicional reduce riesgo
  if (withFiador) score += 5;

  // Simulación crediticio: hash determinístico por email
  const credSeed = hashStr(tenant.email || '') % 100;
  if (credSeed > 80) score += 8;       // excelente
  else if (credSeed > 50) score += 3;  // bueno
  else if (credSeed > 20) score -= 2;  // regular
  else score -= 12;                    // malo

  // Listas negras: 5% probabilidad de hit
  const blSeed = hashStr(tenant.rfc || tenant.email || '') % 100;
  const blacklistOk = blSeed >= 5;
  if (!blacklistOk) score -= 30;

  // Antecedentes legales: 8% probabilidad
  const legalSeed = hashStr((tenant.curp || tenant.email || '') + 'L') % 100;
  const legalOk = legalSeed >= 8;
  if (!legalOk) score -= 25;

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  let fraudRisk = 'low';
  if (score < 40) fraudRisk = 'high';
  else if (score < 65) fraudRisk = 'medium';

  return {
    score,
    identityOk: !!(tenant.rfc && tenant.curp),
    creditOk: credSeed > 30,
    legalOk,
    blacklistOk,
    fraudRisk,
    capacityRatio: Number(ratio.toFixed(2)),
    breakdown: {
      base: 50,
      capacityPoints,
      documentsPoints: Math.min(15, documentsValidated * 3),
      tenurePoints: tenureYears >= 5 ? 8 : tenureYears >= 2 ? 4 : 0,
      creditPoints: credSeed > 80 ? 8 : credSeed > 50 ? 3 : credSeed > 20 ? -2 : -12,
      legalPenalty: legalOk ? 0 : -25,
      blacklistPenalty: blacklistOk ? 0 : -30
    }
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
