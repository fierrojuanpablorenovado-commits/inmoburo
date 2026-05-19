// Generación de PDFs en memoria (Buffer) — compatible con Vercel serverless.

import PDFDocument from 'pdfkit';

const NAVY = '#0a1628';
const TEAL = '#00c896';

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
  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });

  // Header
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('white').fontSize(22).font('Helvetica-Bold').text('MULTIREPORTE INQUILINO', 50, 32);
  doc.fontSize(10).font('Helvetica').text(`Generado: ${new Date().toLocaleDateString('es-MX', {day:'2-digit', month:'long', year:'numeric'})}`, 50, 60);
  doc.fillColor(TEAL).fontSize(10).text(`Reporte #${request.id.slice(0,8).toUpperCase()}`, 400, 60);

  doc.fillColor('#000').moveDown(4);

  // Tenant info
  doc.fontSize(16).font('Helvetica-Bold').fillColor(NAVY).text('Datos del inquilino', 50, 120);
  doc.fontSize(11).font('Helvetica').fillColor('#333');
  const yStart = 145;
  const labels = [
    ['Nombre completo', tenant.fullName],
    ['Correo', tenant.email],
    ['Teléfono', tenant.phone],
    ['RFC', tenant.rfc || 'No proporcionado'],
    ['CURP', tenant.curp || 'No proporcionado'],
    ['Ocupación', tenant.occupation || '—'],
    ['Empleador', tenant.employer || '—'],
    ['Ingreso mensual', tenant.monthlyIncome ? `$${tenant.monthlyIncome.toLocaleString('es-MX')} MXN` : '—']
  ];
  labels.forEach((l, i) => {
    doc.fillColor('#666').text(l[0], 50, yStart + i*18);
    doc.fillColor('#000').font('Helvetica-Bold').text(l[1], 200, yStart + i*18);
    doc.font('Helvetica');
  });

  // Score box
  const sy = yStart + labels.length * 18 + 30;
  doc.rect(50, sy, doc.page.width - 100, 110).fill(NAVY);
  doc.fillColor('white').fontSize(13).font('Helvetica-Bold').text('SCORE DE CONFIABILIDAD', 70, sy + 18);

  const scoreColor = report.score >= 70 ? TEAL : report.score >= 50 ? '#f59e0b' : '#ef4444';
  doc.fillColor(scoreColor).fontSize(48).text(`${report.score}`, 70, sy + 45);
  doc.fillColor('white').fontSize(11).text('/ 100 puntos', 170, sy + 78);

  doc.fontSize(11).text(`Nivel de riesgo de fraude: ${report.fraudRisk.toUpperCase()}`, 280, sy + 45);
  doc.text(`Capacidad de pago: ${report.capacityRatio}x la renta`, 280, sy + 65);
  doc.text(`Documentos verificados`, 280, sy + 85);

  // Verificaciones
  const vy = sy + 130;
  doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold').text('Resultado de verificaciones', 50, vy);
  doc.fontSize(11).font('Helvetica');
  const checks = [
    ['Identidad (INE/CURP/RFC)', report.identityOk],
    ['Historial crediticio', report.creditOk],
    ['Antecedentes legales nacionales', report.legalOk],
    ['Listas negras (PEP/OFAC/SAT-69-B)', report.blacklistOk]
  ];
  checks.forEach((c, i) => {
    const y = vy + 28 + i*22;
    doc.fillColor(c[1] ? '#10b981' : '#ef4444').text(c[1] ? '✓' : '✗', 50, y);
    doc.fillColor('#000').text(c[0], 70, y);
    doc.fillColor(c[1] ? '#10b981' : '#ef4444').font('Helvetica-Bold').text(c[1] ? 'APROBADO' : 'OBSERVADO', 400, y);
    doc.font('Helvetica');
  });

  // Observaciones
  if (report.observations) {
    const oy = vy + 28 + checks.length*22 + 20;
    doc.fillColor(NAVY).fontSize(14).font('Helvetica-Bold').text('Observaciones', 50, oy);
    doc.fillColor('#444').fontSize(10).font('Helvetica').text(report.observations, 50, oy + 22, { width: doc.page.width - 100 });
  }

  // Footer
  doc.fontSize(8).fillColor('#999').text(
    `${organization.name} · Generado por Solventa Buró · Este reporte tiene validez de 30 días a partir de su emisión.`,
    50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 }
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
