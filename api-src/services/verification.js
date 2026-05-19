import { calculateScore, calculateScoreWithNubarium } from './scoring.js';
import {
  isNubariumEnabled,
  validateINE, validateCURP, getIMSSHistory,
  validateRFC, checkBlacklists, getEmailRisk, getPhoneRisk
} from './nubarium.js';

export async function runFullVerification({ tenant, request, documents }) {
  const docsValidated = documents.filter(d => d.status === 'validado').length;
  let scoreData, nubariumResults = null;

  if (isNubariumEnabled) {
    console.log('[NUBARIUM] Iniciando verificación real para', tenant.curp || tenant.email);
    try {
      const [ine, curp, imss, rfc, blacklists, emailRisk, phoneRisk] = await Promise.allSettled([
        validateINE(tenant.curp, null),
        validateCURP(tenant.curp),
        getIMSSHistory(tenant.curp),
        validateRFC(tenant.rfc, tenant.fullName),
        checkBlacklists(tenant.curp, tenant.rfc, tenant.fullName),
        getEmailRisk(tenant.email),
        getPhoneRisk(tenant.phone)
      ]);

      nubariumResults = {
        ine:        ine.status === 'fulfilled'        ? ine.value        : null,
        curp:       curp.status === 'fulfilled'       ? curp.value       : null,
        imss:       imss.status === 'fulfilled'       ? imss.value       : null,
        rfc:        rfc.status === 'fulfilled'        ? rfc.value        : null,
        blacklists: blacklists.status === 'fulfilled' ? blacklists.value : null,
        emailRisk:  emailRisk.status === 'fulfilled'  ? emailRisk.value  : null,
        phoneRisk:  phoneRisk.status === 'fulfilled'  ? phoneRisk.value  : null,
      };

      scoreData = calculateScoreWithNubarium({
        tenant, monthlyRent: request.monthlyRent,
        documentsValidated: docsValidated,
        withFiador: request.withFiador,
        nubariumData: nubariumResults
      });
      console.log('[NUBARIUM] Score calculado:', scoreData.score, '| Fuente salario:', scoreData.incomeSource);
    } catch (e) {
      console.error('[NUBARIUM ERROR]', e.message, '— usando mock fallback');
      scoreData = calculateScore({ tenant, monthlyRent: request.monthlyRent, documentsValidated: docsValidated, withFiador: request.withFiador });
    }
  } else {
    await new Promise(r => setTimeout(r, 800));
    scoreData = calculateScore({ tenant, monthlyRent: request.monthlyRent, documentsValidated: docsValidated, withFiador: request.withFiador });
  }

  const observations = [];
  if (scoreData.capacityRatio < 2.5) observations.push('⚠️ Capacidad de pago ajustada (ratio < 2.5x)');
  if (!scoreData.blacklistOk) observations.push('🚫 Aparece en listas negras');
  if (!scoreData.legalOk) observations.push('⚠️ Antecedentes legales detectados');
  if (!scoreData.creditOk) observations.push('⚠️ Historial crediticio con observaciones');
  if (scoreData.score >= 80) observations.push('✅ Excelente candidato — perfil financiero sólido');
  if (scoreData.empleoActivo === false && isNubariumEnabled) observations.push('⚠️ No se detecta empleo activo en IMSS');
  if (scoreData.incomeSource === 'imss_verificado') observations.push(`📊 Salario verificado IMSS: $${scoreData.incomeSalarioIMSS?.toLocaleString('es-MX')} MXN`);

  return {
    ...scoreData,
    observations: observations.join('\n'),
    nubariumUsed: isNubariumEnabled,
    nubariumResults
  };
}
