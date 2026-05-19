// Generación de PDFs en memoria (Buffer) — compatible con Vercel serverless.

import PDFDocument from 'pdfkit';

const NAVY  = '#1e1b4b';
const LIME  = '#a3e635';
const WHITE = '#ffffff';
const GRAY  = '#64748b';

function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function generateReportPDF({ request, tenant, report, organization }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
  const W = doc.page.width;   // 612
  const M = 50;               // page margin for content
  const now = new Date();
  const dateLong = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const dateTime = now.toLocaleString('es-MX');
  const folio = request.id.slice(0, 8).toUpperCase();

  // ─── A) HEADER ────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 100).fill(NAVY);

  // Brand left
  doc.fillColor(WHITE).fontSize(20).font('Helvetica-Bold')
    .text('SOLVENTA BURÓ', M, 28, { lineBreak: false });
  doc.fillColor(LIME).fontSize(10).font('Helvetica')
    .text('REPORTE DE SOLVENCIA FINANCIERA', M, 54, { lineBreak: false });

  // Report meta right
  doc.fillColor(WHITE).fontSize(9).font('Helvetica')
    .text(`Reporte #${folio}`, W - 200, 36, { width: 150, align: 'right' });
  doc.text(`Fecha: ${dateLong}`, W - 200, 52, { width: 150, align: 'right' });

  let curY = 120;

  // ─── B) INFO CANDIDATO ────────────────────────────────────────────────────
  const boxW = W - M * 2;
  const colW = Math.floor(boxW / 2) - 12;
  const boxH = 130;

  doc.roundedRect(M, curY, boxW, boxH, 6).fill('#f0f0fa');

  const colLabels = [
    ['Nombre',          tenant.fullName || '—'],
    ['Correo',          tenant.email || '—'],
    ['Teléfono',        tenant.phone || '—'],
    ['RFC',             tenant.rfc || 'No proporcionado'],
  ];
  const colRight = [
    ['CURP',            tenant.curp || 'No proporcionado'],
    ['Ocupación',       tenant.occupation || '—'],
    ['Ingreso mensual', (() => {
      const base = tenant.monthlyIncome
        ? `$${Number(tenant.monthlyIncome).toLocaleString('es-MX')} MXN`
        : '—';
      return report.incomeSalarioIMSS
        ? `$${Number(report.incomeSalarioIMSS).toLocaleString('es-MX')} MXN  [Verificado IMSS]`
        : base;
    })()],
    ['Inmueble',        request.propertyAddress || '—'],
  ];

  const renderInfoCol = (rows, x, startY) => {
    rows.forEach(([label, value], i) => {
      const y = startY + i * 26;
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(label, x, y, { width: colW });
      doc.fillColor('#1e1b4b').fontSize(9.5).font('Helvetica-Bold')
        .text(value, x, y + 10, { width: colW, lineBreak: false });
    });
  };

  renderInfoCol(colLabels, M + 12, curY + 12);
  renderInfoCol(colRight,  M + 12 + colW + 24, curY + 12);

  curY += boxH + 18;

  // ─── C) SCORE BOX ─────────────────────────────────────────────────────────
  doc.rect(M, curY, boxW, 120).fill(NAVY);

  const scoreColor =
    report.score >= 80 ? LIME :
    report.score >= 60 ? '#f59e0b' :
    '#ef4444';

  const scoreLabel =
    report.score >= 80 ? 'EXCELENTE CANDIDATO' :
    report.score >= 60 ? 'CANDIDATO ACEPTABLE' :
    'ALTO RIESGO';

  // Big score number
  doc.fillColor(scoreColor).fontSize(60).font('Helvetica-Bold')
    .text(`${report.score}`, M + 24, curY + 22, { lineBreak: false });

  // "/100" suffix — positioned right after the score digits (approx)
  const scoreNumW = String(report.score).length * 36; // rough width at 60pt
  doc.fillColor(WHITE).fontSize(14).font('Helvetica')
    .text('/ 100', M + 24 + scoreNumW, curY + 60, { lineBreak: false });

  // Label
  doc.fillColor(scoreColor).fontSize(13).font('Helvetica-Bold')
    .text(scoreLabel, M + 24 + scoreNumW + 60, curY + 34, { lineBreak: false });

  // Sub-metrics
  const payProb = report.paymentProbability12m != null
    ? `${report.paymentProbability12m}%`
    : `${Math.min(99, Math.round(report.score * 1.05))}%`;
  const capRatio = report.capacityRatio != null
    ? `${report.capacityRatio}x`
    : '—';

  doc.fillColor(WHITE).fontSize(9).font('Helvetica')
    .text(`Probabilidad de pago a 12 meses: ${payProb}`, M + 24, curY + 92);
  doc.text(`Ratio ingreso/compromiso: ${capRatio}`, M + 24, curY + 106);

  curY += 138;

  // ─── D) 8 FACTORES ────────────────────────────────────────────────────────
  doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold')
    .text('Factores de solvencia', M, curY);
  curY += 20;

  const breakdown = report.breakdown || {};
  const FACTOR_NAME_W = 185;
  const BAR_W        = 200;
  const BAR_H        = 8;
  const BAR_GAP      = 28;

  // Helper: draw one factor row
  const drawFactor = (label, value, maxValue, barColor, y) => {
    // Guard new page
    if (y + BAR_GAP + 10 > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    const fill = maxValue > 0 ? Math.max(0, Math.min(1, value / maxValue)) : 0;

    doc.fillColor('#333').fontSize(9).font('Helvetica')
      .text(label, M, y + 1, { width: FACTOR_NAME_W, lineBreak: false });

    // Background bar
    doc.rect(M + FACTOR_NAME_W, y, BAR_W, BAR_H).fill('#e2e8f0');

    // Filled bar
    if (fill > 0) {
      doc.rect(M + FACTOR_NAME_W, y, Math.round(BAR_W * fill), BAR_H).fill(barColor);
    }

    // Value text
    const valStr = maxValue > 0 ? `${value} / ${maxValue}` : (value >= 0 ? 'OK' : `${value}`);
    doc.fillColor(GRAY).fontSize(8.5).font('Helvetica')
      .text(valStr, M + FACTOR_NAME_W + BAR_W + 8, y, { lineBreak: false });

    return y + BAR_GAP;
  };

  // 1. Capacidad de pago — capacityPoints → max 25
  const capacityPts = breakdown.capacityPoints ?? 0;
  curY = drawFactor(
    '1. Capacidad de pago',
    capacityPts, 25,
    capacityPts >= 18 ? '#22c55e' : capacityPts >= 10 ? '#f59e0b' : '#ef4444',
    curY
  );

  // 2. Identidad verificada — identityOk → 10 / 0
  const idPts = breakdown.identityOk ? 10 : 0;
  curY = drawFactor('2. Identidad verificada', idPts, 10,
    breakdown.identityOk ? '#22c55e' : '#ef4444', curY);

  // 3. Validez RFC — creditOk → 5 / 0
  const rfcPts = breakdown.creditOk ? 5 : 0;
  curY = drawFactor('3. Validez RFC', rfcPts, 5,
    breakdown.creditOk ? '#22c55e' : '#ef4444', curY);

  // 4. Historial laboral — tenurePoints → max 10
  const tenurePts = breakdown.tenurePoints ?? 0;
  curY = drawFactor('4. Historial laboral', tenurePts, 10,
    tenurePts >= 7 ? '#22c55e' : tenurePts >= 4 ? '#f59e0b' : '#ef4444', curY);

  // 5. Empleo activo — empleoActivo → 5 / 0
  const empleoPts = (breakdown.empleoActivo || report.empleoActivo) ? 5 : 0;
  curY = drawFactor('5. Empleo activo', empleoPts, 5,
    empleoPts === 5 ? '#22c55e' : '#ef4444', curY);

  // 6. Listas negras — legalPenalty → 0 (ok) or -30
  const legalPenalty = breakdown.legalPenalty ?? 0;
  const legalDisplay = legalPenalty === 0 ? 0 : Math.abs(legalPenalty);
  curY = drawFactor('6. Listas negras',
    legalPenalty === 0 ? 30 : 0, 30,
    legalPenalty === 0 ? '#22c55e' : '#ef4444', curY);

  // 7. Documentos — documentsPoints → max 15
  const docPts = breakdown.documentsPoints ?? 0;
  curY = drawFactor('7. Documentos', docPts, 15,
    docPts >= 10 ? '#22c55e' : docPts >= 6 ? '#f59e0b' : '#ef4444', curY);

  // 8. Riesgo fraude — fraudRisk low/medium/high
  const fraudRisk = report.fraudRisk || 'low';
  const fraudDisplay = fraudRisk === 'low' ? 20 : fraudRisk === 'medium' ? 10 : 0;
  curY = drawFactor('8. Riesgo de fraude', fraudDisplay, 20,
    fraudRisk === 'low' ? '#22c55e' : fraudRisk === 'medium' ? '#f59e0b' : '#ef4444', curY);

  curY += 6;

  // ─── E) VERIFICACIONES ────────────────────────────────────────────────────
  if (curY + 120 > doc.page.height - 80) { doc.addPage(); curY = 50; }

  doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold')
    .text('Verificaciones realizadas', M, curY);
  curY += 18;

  const verifications = [
    ['Identidad (INE / CURP / RFC)',   !!(breakdown.identityOk)],
    ['Listas negras (PEP / OFAC / SAT-69B)', legalPenalty === 0],
    ['Historial laboral (IMSS)',        !!(breakdown.empleoActivo || report.empleoActivo || report.incomeSalarioIMSS)],
    ['Análisis de fraude',             fraudRisk === 'low'],
  ];

  verifications.forEach(([label, ok]) => {
    doc.fillColor(ok ? '#22c55e' : '#ef4444').fontSize(11).font('Helvetica-Bold')
      .text(ok ? '✓' : '✗', M, curY, { lineBreak: false });
    doc.fillColor('#222').fontSize(9.5).font('Helvetica')
      .text(label, M + 18, curY + 1, { lineBreak: false });
    doc.fillColor(ok ? '#22c55e' : '#ef4444').font('Helvetica-Bold')
      .text(ok ? 'VERIFICADO' : 'OBSERVADO', M + 300, curY + 1, { lineBreak: false });
    doc.font('Helvetica');
    curY += 20;
  });

  curY += 8;

  // ─── F) OBSERVACIONES ─────────────────────────────────────────────────────
  if (report.observations) {
    if (curY + 70 > doc.page.height - 80) { doc.addPage(); curY = 50; }

    const obsText = report.observations;
    const obsH = Math.max(50, doc.heightOfString(obsText, { width: boxW - 24 }) + 28);
    doc.rect(M, curY, boxW, obsH).fill('#fef3c7').stroke('#f59e0b');
    doc.fillColor('#92400e').fontSize(9).font('Helvetica-Bold')
      .text('Observaciones', M + 12, curY + 10);
    doc.font('Helvetica').fillColor('#78350f')
      .text(obsText, M + 12, curY + 24, { width: boxW - 24 });
    curY += obsH + 14;
  }

  // ─── G) FOOTER ────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 50;

  // Lime separator line
  doc.rect(M, footerY - 14, boxW, 2).fill(LIME);

  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
    .text(
      'Solventa Buró · La verdad financiera de tus candidatos',
      M, footerY - 4, { align: 'center', width: boxW }
    );
  doc.text(
    `Folio: ${folio} · Válido 30 días · ${dateTime}`,
    M, footerY + 8, { align: 'center', width: boxW }
  );

  return streamToBuffer(doc);
}

export async function generateContractPDF({ contract, request, tenant, organization }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 60 });

  doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('CONTRATO DE ARRENDAMIENTO', { align: 'center' });
  doc.moveDown(.4);
  doc.fillColor('#666').fontSize(10).font('Helvetica').text(`Contrato #${contract.id.slice(0,8).toUpperCase()} · ${organization.name}`, { align: 'center' });
  doc.moveDown(1.5);

  const startsTxt = new Date(contract.startDate).toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
  const endsTxt = new Date(contract.endDate).toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});

  doc.fillColor('#000').fontSize(11).font('Helvetica').text(
    `En la Ciudad de México, el día ${startsTxt}, comparecen las partes para celebrar el presente CONTRATO DE ARRENDAMIENTO sobre el inmueble ubicado en ${request.propertyAddress}, conforme a las siguientes:`,
    { align: 'justify' }
  );
  doc.moveDown(1);

  doc.font('Helvetica-Bold').text('CLÁUSULAS', { align: 'center' });
  doc.moveDown(.5);

  const clauses = [
    ['PRIMERA — OBJETO.', `El ARRENDADOR otorga en arrendamiento al ARRENDATARIO el inmueble ubicado en ${request.propertyAddress}.`],
    ['SEGUNDA — VIGENCIA.', `Doce (12) meses forzosos a partir del ${startsTxt} y hasta el ${endsTxt}.`],
    ['TERCERA — RENTA.', `La renta mensual es de $${contract.monthlyRent.toLocaleString('es-MX')} MXN, pagadera por mes adelantado dentro de los primeros 5 días de cada mes.`],
    ['CUARTA — DEPÓSITO.', `El ARRENDATARIO entrega un depósito en garantía por $${contract.deposit.toLocaleString('es-MX')} MXN que será reintegrado al término del contrato previa verificación del inmueble.`],
    ['QUINTA — USO.', 'El inmueble se destinará exclusivamente a casa-habitación. Queda prohibido cualquier uso comercial o subarrendamiento.'],
    ['SEXTA — SERVICIOS.', 'Los servicios de agua, luz, gas, internet y mantenimiento son por cuenta del ARRENDATARIO.'],
    ['SÉPTIMA — CONVENIO DE JUSTICIA ALTERNATIVA.', 'Las partes pactan que en caso de incumplimiento, someterán la controversia al CJA (Centro de Justicia Alternativa) correspondiente, en términos de la Ley de Justicia Alternativa local, reduciendo así los tiempos de resolución a 2-4 meses.'],
    ['OCTAVA — CESIÓN DE DERECHOS.', `Solventa Buró gestiona la presente operación. El ARRENDADOR acepta los términos de protección contratados según plan: ${request.plan.toUpperCase()}.`]
  ];

  clauses.forEach(c => {
    doc.font('Helvetica-Bold').fontSize(10).text(c[0], { continued: true });
    doc.font('Helvetica').text(' ' + c[1], { align: 'justify' });
    doc.moveDown(.5);
  });

  doc.moveDown(2);

  doc.fontSize(10).text('________________________', 80, doc.y, { continued: true });
  doc.text('         ', { continued: true });
  doc.text('________________________');
  doc.moveDown(.3);
  doc.font('Helvetica-Bold').text('ARRENDADOR', 90, doc.y, { continued: true });
  doc.text('                              ', { continued: true });
  doc.text('ARRENDATARIO');
  doc.font('Helvetica').fontSize(9).fillColor('#666');
  doc.text(organization.name, 80, doc.y, { continued: true });
  doc.text('                                ', { continued: true });
  doc.text(tenant.fullName);

  doc.fontSize(8).fillColor('#999').text(
    `Documento generado digitalmente por Solventa Buró · ${new Date().toLocaleString('es-MX')}`,
    60, doc.page.height - 50, { align: 'center', width: doc.page.width - 120 }
  );

  return streamToBuffer(doc);
}
