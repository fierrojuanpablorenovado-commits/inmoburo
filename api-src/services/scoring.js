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

export function calculateScoreWithNubarium({ tenant, monthlyRent, documentsValidated, withFiador, nubariumData }) {
  if (!nubariumData) return calculateScore({ tenant, monthlyRent, documentsValidated, withFiador });

  let score = 50;
  const { curp, imss, rfc, blacklists, emailRisk, phoneRisk, ine } = nubariumData;

  // Capacidad de pago — usa salario IMSS verificado si está disponible
  const income = imss?.lastSalary || tenant.monthlyIncome || 0;
  const ratio = monthlyRent > 0 ? income / monthlyRent : 0;
  let capacityPoints = 0;
  if (ratio >= 4) capacityPoints = 25;
  else if (ratio >= 3) capacityPoints = 20;
  else if (ratio >= 2.5) capacityPoints = 12;
  else if (ratio >= 2) capacityPoints = 5;
  else capacityPoints = -10;
  score += capacityPoints;

  // Documentos
  score += Math.min(15, documentsValidated * 3);

  // Identidad Nubarium
  const identityVerified = ine?.valid && curp?.valid;
  if (identityVerified) score += 10;
  else if (curp?.valid) score += 5;
  else score -= 5;

  // RFC válido
  if (rfc?.valid && rfc?.status === 'ACTIVO') score += 5;

  // Antigüedad laboral IMSS real
  const tenureMonths = imss?.totalMonths || 0;
  let tenurePoints = 0;
  if (tenureMonths >= 60) tenurePoints = 10;
  else if (tenureMonths >= 24) tenurePoints = 6;
  else if (tenureMonths >= 12) tenurePoints = 3;
  else tenurePoints = -3;
  score += tenurePoints;

  // Empleo activo
  if (imss?.currentlyEmployed) score += 5;

  // Listas negras reales
  const blacklistOk = blacklists?.clean !== false;
  if (!blacklistOk) score -= 30;

  // Email/Phone risk
  if (emailRisk?.risk === 'high') score -= 5;
  if (phoneRisk?.risk === 'high') score -= 5;

  // Fiador
  if (withFiador) score += 5;

  score = Math.max(0, Math.min(100, Math.round(score)));
  let fraudRisk = score < 40 ? 'high' : score < 65 ? 'medium' : 'low';

  return {
    score,
    identityOk: !!(ine?.valid || curp?.valid),
    creditOk: null, // null = no evaluado (diferente de true = ok o false = problema)
    creditNotEvaluated: true,
    legalOk: blacklistOk,
    blacklistOk,
    fraudRisk,
    capacityRatio: Number(ratio.toFixed(2)),
    incomeSalarioIMSS: imss?.lastSalary || null,
    incomeSource: imss?.lastSalary ? 'imss_verificado' : 'declarado',
    empleoActivo: imss?.currentlyEmployed || false,
    mesesCotizados: tenureMonths,
    breakdown: {
      base: 50,
      capacityPoints,
      documentsPoints: Math.min(15, documentsValidated * 3),
      identityPoints: identityVerified ? 10 : curp?.valid ? 5 : -5,
      rfcPoints: rfc?.valid ? 5 : 0,
      tenurePoints,
      empleoPoints: imss?.currentlyEmployed ? 5 : 0,
      legalPenalty: blacklistOk ? 0 : -30,
      riskPenalty: (emailRisk?.risk === 'high' ? -5 : 0) + (phoneRisk?.risk === 'high' ? -5 : 0),
      creditNote: 'Historial crediticio no evaluado — Círculo de Crédito pendiente de integración'
    }
  };
}
