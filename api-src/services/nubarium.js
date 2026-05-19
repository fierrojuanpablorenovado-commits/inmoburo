// Nubarium API — wrapper con mock realista cuando no hay credenciales
// Docs reales llegan con el API key. Base URL placeholder: https://api.nubarium.com/v1

import { createHash } from 'crypto';

const API_KEY = process.env.NUBARIUM_API_KEY || '';
export const isNubariumEnabled = API_KEY.startsWith('nb_');
const BASE = 'https://api.nubarium.com/v1';

async function call(endpoint, body) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Nubarium ${endpoint}: ${r.status}`);
  return r.json();
}

// Seed determinístico por CURP para que el mismo candidato siempre tenga el mismo mock
function seed(str, offset = 0) {
  const h = createHash('md5').update(str + offset).digest('hex');
  return parseInt(h.slice(0, 8), 16);
}

// ── INE vs Lista Nominal ──────────────────────────────────
export async function validateINE(curp, claveElector) {
  if (isNubariumEnabled) return call('/ine/validate', { curp, claveElector });
  const s = seed(curp || claveElector || '', 1);
  const valid = (s % 100) < 90; // 90% válida
  return { valid, source: 'mock', name: valid ? 'REGISTRADO EN LISTA NOMINAL' : null, error: valid ? null : 'No encontrado en lista nominal' };
}

// ── CURP / RENAPO ─────────────────────────────────────────
export async function validateCURP(curp) {
  if (isNubariumEnabled) return call('/curp/validate', { curp });
  const s = seed(curp, 2);
  const valid = (s % 100) < 92;
  const names = ['JUAN PABLO','CARLOS ALBERTO','MARÍA FERNANDA','LUIS EDUARDO','ANA SOFÍA'];
  const surnames = ['GARCÍA LÓPEZ','MARTÍNEZ HERNÁNDEZ','PÉREZ RODRÍGUEZ','SÁNCHEZ TORRES','FLORES JIMÉNEZ'];
  return {
    valid, source: 'mock',
    name: valid ? `${names[s % names.length]} ${surnames[(s+1) % surnames.length]}` : null,
    dob: valid ? `${1985 + (s % 25)}-${String((s % 12)+1).padStart(2,'0')}-${String((s % 28)+1).padStart(2,'0')}` : null,
    gender: (s % 2) === 0 ? 'M' : 'F',
    state: ['JALISCO','CDMX','NUEVO LEON','GUANAJUATO','PUEBLA'][s % 5]
  };
}

// ── Historial Laboral IMSS ────────────────────────────────
export async function getIMSSHistory(curp) {
  if (isNubariumEnabled) return call('/imss/history', { curp });
  const s = seed(curp, 3);
  const totalMonths = 6 + (s % 180); // 6 meses a 15 años
  const currentlyEmployed = (s % 100) < 75;
  const baseSalary = 8000 + (s % 37000); // $8K a $45K MXN
  const employers = ['EMPRESA SA DE CV','COMERCIALIZADORA DEL NORTE','GRUPO EMPRESARIAL MX','SERVICIOS PROFESIONALES SC','DESARROLLO INMOBILIARIO SA'];
  return {
    source: 'mock',
    currentlyEmployed,
    totalMonths,
    lastSalary: baseSalary,
    nss: `${String(s % 10)}${String(s % 100).padStart(9,'0')}`,
    periods: [{
      employer: employers[s % employers.length],
      registroPatronal: `JAL${String(s % 9999999).padStart(7,'0')}`,
      start: `${2020 - Math.floor(totalMonths/12)}-01-01`,
      end: currentlyEmployed ? null : `${2023 + (s%2)}-${String((s%12)+1).padStart(2,'0')}-01`,
      salary: baseSalary,
      active: currentlyEmployed
    }]
  };
}

// ── RFC ───────────────────────────────────────────────────
export async function validateRFC(rfc, name = '') {
  if (isNubariumEnabled) return call('/rfc/validate', { rfc, name });
  const s = seed(rfc, 4);
  const valid = rfc?.length >= 12 && (s % 100) < 88;
  return {
    valid, source: 'mock',
    type: rfc?.length === 13 ? 'fisica' : 'moral',
    status: valid ? 'ACTIVO' : 'NO_LOCALIZADO',
    name: valid ? name || 'CONTRIBUYENTE ACTIVO' : null
  };
}

// ── Listas Negras / PEP ───────────────────────────────────
export async function checkBlacklists(curp, rfc, name = '') {
  if (isNubariumEnabled) return call('/blacklists/check', { curp, rfc, name });
  const s = seed((curp || '') + (rfc || ''), 5);
  const hit = (s % 100) < 8; // 8% tiene algún hit
  return {
    source: 'mock',
    clean: !hit,
    hits: hit ? [{ list: ['SAT-69B','OFAC','PEP-NACIONAL'][s % 3], reason: 'Coincidencia parcial detectada', severity: 'medium' }] : [],
    checked: ['SAT-69B','OFAC','PEP-NACIONAL','ONU-SANCIONES']
  };
}

// ── CLABE (API+) ──────────────────────────────────────────
export async function validateCLABE(clabe, name = '') {
  if (isNubariumEnabled) return call('/clabe/validate', { clabe, name });
  const s = seed(clabe || '', 6);
  const valid = clabe?.length === 18 && (s % 100) < 85;
  const banks = ['BBVA BANCOMER','BANORTE','SANTANDER','CITIBANAMEX','HSBC','SCOTIABANK'];
  return { valid, source: 'mock', bank: banks[s % banks.length], ownerMatch: valid && (s % 100) < 80 };
}

// ── Email Risk Score (API+) ───────────────────────────────
export async function getEmailRisk(email) {
  if (isNubariumEnabled) return call('/email/risk', { email });
  const s = seed(email || '', 7);
  const score = 20 + (s % 75);
  return { source: 'mock', score, risk: score < 40 ? 'low' : score < 70 ? 'medium' : 'high' };
}

// ── Phone Risk Score (API+) ───────────────────────────────
export async function getPhoneRisk(phone) {
  if (isNubariumEnabled) return call('/phone/risk', { phone });
  const s = seed(phone || '', 8);
  const score = 15 + (s % 70);
  return { source: 'mock', score, risk: score < 40 ? 'low' : score < 65 ? 'medium' : 'high' };
}

// ── OCR Documento (API+) ──────────────────────────────────
export async function extractDocumentOCR(base64, docType) {
  if (isNubariumEnabled) return call('/ocr/extract', { base64, docType });
  return { source: 'mock', docType, extracted: true, data: { status: 'legible' } };
}
