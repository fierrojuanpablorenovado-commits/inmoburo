/* INMOBURO SaaS — Frontend conectado al backend
   ============================================== */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmtMx = n => '$' + Number(n || 0).toLocaleString('es-MX', {maximumFractionDigits: 0});
const initials = name => (name||'?').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const planLabel = p => ({multireporte:'Radar', multiproteccion:'Cobertura', premium:'Cobertura Élite'}[p] || p);
const planPrice = p => ({multireporte:999, multiproteccion:4600, premium:7500}[p] || 0);
// Probabilidad de pago a 12 meses (basada en score)
const payProbability = score => {
  if (score >= 90) return 96;
  if (score >= 80) return 92;
  if (score >= 70) return 86;
  if (score >= 60) return 74;
  if (score >= 50) return 58;
  if (score >= 40) return 42;
  return Math.max(15, score * 0.7);
};
const statusLabel = s => ({nuevo:'Nuevo', revision:'En revisión', validado:'Validado', rechazado:'Rechazado'}[s] || s);
const statusClass = s => ({nuevo:'new', revision:'rev', validado:'ok', rechazado:'rej'}[s] || 'new');
const fmtDate = s => s ? new Date(s).toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'}) : '-';
const timeAgo = d => {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.round(ms/60000);
  if (m < 1) return 'Justo ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.round(m/60);
  if (h < 24) return `Hace ${h} h`;
  const dy = Math.round(h/24);
  if (dy < 7) return `Hace ${dy} d`;
  return new Date(d).toLocaleDateString('es-MX');
};

let SESSION = null;

/* ===== AUTH ===== */

function openAuth() { $('#auth-gate').classList.add('open'); $('#app').style.display = 'none'; }
function closeAuth() { $('#auth-gate').classList.remove('open'); $('#app').style.display = 'grid'; }

$$('.auth-tab').forEach(b => b.addEventListener('click', () => {
  $$('.auth-tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $('#tab-login').style.display = b.dataset.tab === 'login' ? 'block' : 'none';
  $('#tab-signup').style.display = b.dataset.tab === 'signup' ? 'block' : 'none';
}));

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await API.auth.login({ email: f.get('email'), password: f.get('password') });
    API.setToken(r.token);
    SESSION = r;
    afterAuth();
  } catch (err) { alert('Error: ' + err.message); }
});

$('#signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await API.auth.signup({
      name: f.get('name'), email: f.get('email'), password: f.get('password'),
      company: f.get('company'), phone: f.get('phone')
    });
    API.setToken(r.token);
    SESSION = r;
    afterAuth();
  } catch (err) { alert('Error: ' + err.message); }
});

function afterAuth() {
  $('#user-name').textContent = SESSION.user.name;
  $('#user-email').textContent = SESSION.user.email;
  $('#user-avatar').textContent = initials(SESSION.user.name);
  closeAuth();
  if (!location.hash) location.hash = '#/dashboard';
  route();
}

$('#logout-btn').addEventListener('click', e => {
  e.preventDefault();
  if (confirm('¿Cerrar sesión?')) { API.clearToken(); location.reload(); }
});

/* ===== GLOBAL SEARCH ===== */

let searchTimer;
$('#global-search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $('#search-results').classList.remove('open'); return; }
  searchTimer = setTimeout(async () => {
    const r = await API.dashboard.search(q);
    let html = '';
    if (r.tenants.length) {
      html += `<div class="sr-section">Inquilinos</div>`;
      r.tenants.forEach(t => { html += `<a class="sr-item" href="#/inquilinos">👤 ${escapeHtml(t.fullName)} · ${escapeHtml(t.email)}</a>`; });
    }
    if (r.requests.length) {
      html += `<div class="sr-section">Solicitudes</div>`;
      r.requests.forEach(req => { html += `<a class="sr-item" href="#/solicitud/${req.id}">📋 ${escapeHtml(req.tenant.fullName)} · ${escapeHtml(req.propertyAddress)}</a>`; });
    }
    if (r.contracts.length) {
      html += `<div class="sr-section">Contratos</div>`;
      r.contracts.forEach(c => { html += `<a class="sr-item" href="#/contratos">📄 ${escapeHtml(c.tenant.fullName)} · ${fmtMx(c.monthlyRent)}</a>`; });
    }
    if (!html) html = `<div style="padding:20px;text-align:center;color:var(--bone-400)">Sin resultados</div>`;
    $('#search-results').innerHTML = html;
    $('#search-results').classList.add('open');
  }, 250);
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search')) $('#search-results').classList.remove('open');
});

/* ===== VIEWS ===== */

async function viewDashboard() {
  const [stats, requests, activity] = await Promise.all([
    API.dashboard.stats(),
    API.requests.list({}),
    API.activity.list(8)
  ]);

  const recent = requests.slice(0, 5);
  const validationRate = stats.requests.validationRate;

  return `
    <div class="page-head">
      <div>
        <h1>Hola, ${escapeHtml(SESSION.user.name.split(' ')[0])} 👋</h1>
        <p>Resumen de actividad en ${escapeHtml(SESSION.organization.name)}</p>
      </div>
      <button class="btn btn-primary" onclick="openNewRequest()">+ Nueva solicitud</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Solicitudes totales</div><div class="val">${stats.requests.total}</div><div class="trend up">✓ ${validationRate}% validadas</div></div>
      <div class="kpi accent"><div class="lbl">Inquilinos validados</div><div class="val">${stats.requests.validated}</div><div class="trend up">↑ Score prom. ${stats.scoring.avg}</div></div>
      <div class="kpi"><div class="lbl">Contratos activos</div><div class="val">${stats.contracts.active}</div><div class="trend up">📄 generados</div></div>
      <div class="kpi"><div class="lbl">Ingresos cobrados</div><div class="val">${fmtMx(stats.revenue.paid)}</div><div class="trend up">${stats.revenue.paidCount} pagos</div></div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-head">
          <h3>Solicitudes recientes</h3>
          <a href="#/solicitudes" class="link">Ver todas →</a>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Inquilino</th><th>Inmueble</th><th>Renta</th><th>Plan</th><th>Estado</th><th></th></tr></thead>
            <tbody>
            ${recent.length ? recent.map(r => `
              <tr>
                <td><div class="name-cell"><div class="ava">${initials(r.tenant.fullName)}</div><div><div>${escapeHtml(r.tenant.fullName)}</div><div style="font-size:12px;color:var(--bone-500);font-weight:400">${escapeHtml(r.tenant.email)}</div></div></div></td>
                <td style="color:var(--bone-600);font-size:13px;max-width:200px">${escapeHtml(r.propertyAddress)}</td>
                <td><strong>${fmtMx(r.monthlyRent)}</strong></td>
                <td>${planLabel(r.plan)}</td>
                <td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
                <td><a href="#/solicitud/${r.id}" class="btn btn-icon">→</a></td>
              </tr>`).join('') : `<tr><td colspan="6" class="empty">Sin solicitudes aún</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Actividad reciente</h3></div>
        ${activity.length ? activity.map(a => `
          <div class="activity-item">
            <div class="activity-dot">${a.icon || '📌'}</div>
            <div class="meta">
              <div class="text">${a.description}</div>
              <div class="time">${timeAgo(a.createdAt)}${a.user ? ' · ' + escapeHtml(a.user.name) : ''}</div>
            </div>
          </div>
        `).join('') : '<div class="empty">Sin actividad reciente</div>'}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-head"><h3>Distribución de scores</h3></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
        ${[
          ['Excelente (80-100)', stats.scoring.distribution.excellent, '#10b981'],
          ['Bueno (65-79)', stats.scoring.distribution.good, '#3b82f6'],
          ['Regular (50-64)', stats.scoring.distribution.average, '#f59e0b'],
          ['Bajo (<50)', stats.scoring.distribution.poor, '#ef4444']
        ].map(([l,v,c]) => `
          <div style="padding:18px;background:var(--bone-50);border-radius:10px;border-left:4px solid ${c}">
            <div style="font-size:13px;color:var(--bone-500);margin-bottom:4px">${l}</div>
            <div style="font-size:28px;font-weight:800;color:${c}">${v}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function viewSolicitudes() {
  const reqs = await API.requests.list({});
  const counts = {
    all: reqs.length,
    nuevo: reqs.filter(r => r.status === 'nuevo').length,
    revision: reqs.filter(r => r.status === 'revision').length,
    validado: reqs.filter(r => r.status === 'validado').length,
    rechazado: reqs.filter(r => r.status === 'rechazado').length
  };

  return `
    <div class="page-head">
      <div><h1>Solicitudes</h1><p>${reqs.length} solicitudes en tu organización</p></div>
      <button class="btn btn-primary" onclick="openNewRequest()">+ Nueva solicitud</button>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="filterReq('all', this)">Todas (${counts.all})</button>
      <button class="tab" onclick="filterReq('nuevo', this)">Nuevas (${counts.nuevo})</button>
      <button class="tab" onclick="filterReq('revision', this)">En revisión (${counts.revision})</button>
      <button class="tab" onclick="filterReq('validado', this)">Validadas (${counts.validado})</button>
      <button class="tab" onclick="filterReq('rechazado', this)">Rechazadas (${counts.rechazado})</button>
    </div>

    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table" id="reqs-table">
          <thead><tr><th>Inquilino</th><th>Inmueble</th><th>Renta</th><th>Plan</th><th>Progreso</th><th>Estado</th><th>Score</th><th></th></tr></thead>
          <tbody>
          ${reqs.length ? reqs.map(r => `
            <tr data-status="${r.status}">
              <td><div class="name-cell"><div class="ava">${initials(r.tenant.fullName)}</div><div><div>${escapeHtml(r.tenant.fullName)}</div><div style="font-size:12px;color:var(--bone-500);font-weight:400">${escapeHtml(r.tenant.phone)}</div></div></div></td>
              <td style="color:var(--bone-600);font-size:13px;max-width:240px">${escapeHtml(r.propertyAddress)}</td>
              <td><strong>${fmtMx(r.monthlyRent)}</strong></td>
              <td>${planLabel(r.plan)}${r.withFiador?' + Fiador':''}</td>
              <td><div style="background:var(--bone-100);height:6px;border-radius:99px;width:90px;overflow:hidden"><div style="background:var(--lime-500);height:100%;width:${r.progress}%"></div></div><div style="font-size:11px;color:var(--bone-500);margin-top:4px">${r.progress}%</div></td>
              <td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
              <td><strong style="color:${r.report?.score>=70?'var(--green-500)':r.report?'var(--red-500)':'var(--bone-400)'}">${r.report?.score ?? '-'}</strong></td>
              <td><a href="#/solicitud/${r.id}" class="btn btn-icon">→</a></td>
            </tr>`).join('') : `<tr><td colspan="8" class="empty"><div class="icon-big">📋</div>No hay solicitudes todavía<br><button class="btn btn-primary" style="margin-top:14px" onclick="openNewRequest()">Crear la primera</button></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.filterReq = (s, btn) => {
  $$('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  $$('#reqs-table tbody tr').forEach(tr => {
    tr.style.display = (s === 'all' || tr.dataset.status === s) ? '' : 'none';
  });
};

async function viewSolicitudDetail(id) {
  let r;
  try { r = await API.requests.get(id); }
  catch { return `<div class="empty"><div class="icon-big">🔍</div><h3>Solicitud no encontrada</h3></div>`; }

  const t = r.tenant;
  const score = r.report?.score;
  const totalPaid = r.payments?.filter(p=>p.status==='paid').reduce((s,p)=>s+p.amount,0) || 0;
  const docsByStatus = (r.documents || []).reduce((acc,d) => (acc[d.status]=(acc[d.status]||0)+1, acc), {});

  // Score breakdown — 8 factores con valores derivados del reporte
  const ratio = r.report?.capacityRatio || 0;
  const capPts = ratio >= 4 ? 25 : ratio >= 3 ? 20 : ratio >= 2.5 ? 12 : ratio >= 2 ? 5 : 0;
  const docsValid = (r.documents||[]).filter(d => d.status === 'validado').length;
  const breakdown = r.report ? [
    { lbl: 'Capacidad de pago',   pts: capPts, max: 25, status: capPts >= 20 ? 'ok' : capPts >= 10 ? 'warn' : 'bad' },
    { lbl: 'Documentos validados', pts: Math.min(15, docsValid*2.5), max: 15, status: docsValid >= 5 ? 'ok' : 'warn' },
    { lbl: 'Identidad (INE/CURP)', pts: r.report.identityOk ? 8 : 0, max: 8, status: r.report.identityOk ? 'ok' : 'bad' },
    { lbl: 'Antigüedad laboral',  pts: t.tenure ? 8 : 4, max: 8, status: 'ok' },
    { lbl: 'Fiador',              pts: r.withFiador ? 5 : 0, max: 5, status: r.withFiador ? 'ok' : 'warn' },
    { lbl: 'Historial crediticio', pts: r.report.creditOk ? 12 : 0, max: 12, status: r.report.creditOk ? 'ok' : 'bad' },
    { lbl: 'Antecedentes legales', pts: r.report.legalOk ? 25 : 0, max: 25, status: r.report.legalOk ? 'ok' : 'bad' },
    { lbl: 'Listas negras',       pts: r.report.blacklistOk ? 30 : 0, max: 30, status: r.report.blacklistOk ? 'ok' : 'bad' }
  ] : [];

  // Timeline de hitos
  const tl = [
    { lbl: 'Solicitud creada',      done: true,  meta: fmtDate(r.createdAt) },
    { lbl: 'Liga enviada al inquilino', done: true,  meta: 'Email + WhatsApp' },
    { lbl: 'Documentos recibidos',  done: r.documents.length > 0, meta: `${r.documents.length} de 6` },
    { lbl: 'Análisis ejecutado',    done: !!r.report, meta: r.report ? '8 factores · ' + r.report.fraudRisk + ' risk' : 'Pendiente' },
    { lbl: 'Score entregado',       done: !!r.report, meta: r.report ? `${r.report.score} / 100` : 'En proceso' },
    { lbl: 'Contrato firmado',      done: !!r.contract, meta: r.contract ? fmtDate(r.contract.signedAt) : 'Pendiente' }
  ];
  let currentSet = false;
  const tlAnnotated = tl.map(item => {
    if (item.done) return { ...item, klass: 'done' };
    if (!currentSet) { currentSet = true; return { ...item, klass: 'current' }; }
    return { ...item, klass: 'pending' };
  });

  return `
    <div style="margin-bottom:18px"><a href="#/solicitudes" style="color:var(--bone-500);font-size:14px">← Volver a solicitudes</a></div>
    <div class="page-head">
      <div>
        <h1>${escapeHtml(t.fullName)}</h1>
        <p>Solicitud <code style="background:var(--bone-100);padding:2px 6px;border-radius:4px">${r.id.slice(0,8)}</code> · ${escapeHtml(r.propertyAddress)}</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <span class="status-pill ${statusClass(r.status)}" style="padding:8px 14px;font-size:13px">${statusLabel(r.status)}</span>
        ${r.status !== 'validado' && r.status !== 'rechazado' ? `<button class="btn btn-outline btn-sm" onclick="advanceReq('${r.id}')">▶ Avanzar estado</button>` : ''}
        ${r.status !== 'rechazado' && r.status !== 'validado' ? `<button class="btn btn-outline btn-sm" style="border-color:var(--red-500);color:var(--red-500)" onclick="rejectReq('${r.id}')">Rechazar</button>` : ''}
      </div>
    </div>

    <div class="two-col">
      <div>
        ${score !== undefined ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-head">
            <h3>Score explicable</h3>
            <a href="#" class="link" onclick="downloadReport('${r.report.id}', '${escapeHtml(t.fullName)}'); return false;">↓ Descargar Multireporte PDF</a>
          </div>
          <div style="display:grid;grid-template-columns:200px 1fr;gap:28px;align-items:center">
            <div>
              <div class="score-circle" style="--pct:${score}"><div class="v">${score}</div></div>
              <p style="text-align:center;margin-top:14px;color:var(--bone-500);font-size:13px">
                ${score >= 80 ? '✅ Excelente' : score >= 60 ? '⚠️ Aceptable' : '❌ Alto riesgo'}
              </p>
            </div>
            <div>
              <div style="font-family:var(--font-display);font-size:13px;color:var(--bone-500);font-weight:600;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Descomposición del score · 8 factores</div>
              <div class="score-bars">
                ${breakdown.map(b => `
                  <div class="score-bar">
                    <div class="lbl">${b.lbl}</div>
                    <div class="track"><div class="fill ${b.status === 'bad' ? 'bad' : b.status === 'warn' ? 'warn' : ''}" style="width:${(b.pts/b.max*100).toFixed(0)}%"></div></div>
                    <div class="val">${b.pts}/${b.max}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="prediction-widget">
            <div class="lbl">Probabilidad de pago puntual a 12 meses</div>
            <div class="pct">${payProbability(score)}%</div>
            <div class="note">Modelo entrenado con cohorte histórica del mercado mexicano · Capacidad de pago ${r.report.capacityRatio}x · Riesgo ${r.report.fraudRisk}</div>
          </div>
          ${r.report.observations ? `<div style="margin-top:16px;padding:14px;background:var(--bone-50);border-radius:10px;font-size:13px;white-space:pre-line;border-left:3px solid var(--lime-500)">${escapeHtml(r.report.observations)}</div>`:''}
        </div>` : `<div class="card" style="margin-bottom:20px"><div class="empty"><div class="icon-big">⏳</div><p>Score disponible al validar la solicitud</p></div></div>`}

        <div class="card">
          <div class="card-head"><h3>Documentos del inquilino</h3><span style="font-size:12px;color:var(--bone-500)">${r.documents.length} total · ${docsByStatus.validado||0} validados</span></div>
          <div style="display:grid;gap:10px">
            ${r.documents.length ? r.documents.map(d => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--bone-50);border-radius:10px">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:18px">📎</span>
                  <div>
                    <div style="font-weight:600;font-size:14px">${escapeHtml(({ine:'INE',domicilio:'Comprobante de domicilio',ingresos:'Comprobantes de ingresos',banco:'Estado de cuenta bancario',referencias:'Referencias',empleo:'Comprobante de empleo',otro:'Documento'}[d.type] || d.type))}</div>
                    <div style="font-size:11px;color:var(--bone-500)">${escapeHtml(d.filename)} · ${(d.size/1024).toFixed(0)} KB</div>
                  </div>
                </div>
                <span class="status-pill ${statusClass(d.status==='revision'?'revision':d.status==='validado'?'validado':'rechazado')}">${d.status==='validado'?'Validado':d.status==='revision'?'En revisión':'Rechazado'}</span>
              </div>
            `).join('') : '<div class="empty">Sin documentos subidos aún</div>'}
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:20px">
          <div class="card-head"><h3>Timeline del proceso</h3></div>
          <div class="timeline">
            ${tlAnnotated.map((tl, i) => `
              <div class="tl-item ${tl.klass}">
                <div class="tl-dot">${tl.klass === 'done' ? '✓' : (i+1)}</div>
                <div>
                  <div class="tl-title">${tl.lbl}</div>
                  <div class="tl-meta">${tl.meta}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card" style="margin-bottom:20px">
          <div class="card-head"><h3>Datos del inquilino</h3></div>
          <div style="display:grid;gap:10px;font-size:14px">
            ${[
              ['Nombre', t.fullName],['Correo', t.email],['Teléfono', t.phone],
              ['RFC', t.rfc || '—'],['Ocupación', t.occupation || '—'],
              ['Ingreso mensual', t.monthlyIncome ? fmtMx(t.monthlyIncome) : '—'],
              ['Empleador', t.employer || '—'],['Antigüedad', t.tenure || '—']
            ].map(([l,v]) => `<div><div style="color:var(--bone-500);font-size:12px">${l}</div><div style="font-weight:600">${escapeHtml(v)}</div></div>`).join('')}
          </div>
        </div>

        <div class="card" style="margin-bottom:20px">
          <div class="card-head"><h3>Detalle de la operación</h3></div>
          <div style="display:grid;gap:10px;font-size:14px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Renta mensual</span><strong>${fmtMx(r.monthlyRent)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Plan</span><strong>${planLabel(r.plan)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Fiador</span><strong>${r.withFiador?'Sí':'No'}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Persona moral</span><strong>${r.withCorporate?'Sí':'No'}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Cobrado</span><strong style="color:var(--indigo-700)">${fmtMx(totalPaid)}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Creada</span><span>${fmtDate(r.createdAt)}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Última actualización</span><span>${fmtDate(r.updatedAt)}</span></div>
            ${r.createdBy ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Asesor</span><span>${escapeHtml(r.createdBy.name)}</span></div>`:''}
          </div>
          ${r.status === 'validado' && !r.contract ? `<button class="btn btn-primary btn-block" style="margin-top:18px" onclick="generateContract('${r.id}')">📄 Generar contrato</button>` : ''}
          ${r.contract ? `<button class="btn btn-outline btn-block" style="margin-top:14px" onclick="downloadContract('${r.contract.id}', '${escapeHtml(t.fullName)}')">↓ Descargar contrato PDF</button>` : ''}
        </div>

        ${r.policy ? `
        <div class="card" style="border:1px solid var(--lime-500); background:linear-gradient(180deg,#e6faf3 0%,white 50%)">
          <div class="card-head"><h3>🛡️ Póliza ${planLabel(r.policy.plan)}</h3></div>
          <div style="font-size:14px">
            <div><span style="color:var(--bone-500)">Número:</span> <strong style="font-family:monospace">${r.policy.policyNumber}</strong></div>
            <div style="margin-top:6px"><span style="color:var(--bone-500)">Cobertura:</span> <strong>${fmtMx(r.policy.coverage)}</strong></div>
            <div style="margin-top:6px"><span style="color:var(--bone-500)">Vigencia:</span> ${fmtDate(r.policy.startDate)} → ${fmtDate(r.policy.endDate)}</div>
          </div>
        </div>`:''}
      </div>
    </div>
  `;
}

window.advanceReq = async (id) => {
  try {
    await API.requests.advance(id);
    route();
  } catch (e) { alert('Error: ' + e.message); }
};
window.rejectReq = async (id) => {
  const reason = prompt('Razón del rechazo (opcional):');
  if (reason === null) return;
  try { await API.requests.reject(id, reason); route(); } catch (e) { alert('Error: ' + e.message); }
};
window.generateContract = async (reqId) => {
  try { await API.contracts.fromRequest(reqId); alert('✅ Contrato generado'); location.hash = '#/contratos'; }
  catch (e) { alert('Error: ' + e.message); }
};
window.downloadReport = (id, name) => API.downloadPdf('/reports/' + id + '/pdf', `multireporte-${name.replace(/\s+/g,'-')}.pdf`);
window.downloadContract = (id, name) => API.downloadPdf('/contracts/' + id + '/pdf', `contrato-${name.replace(/\s+/g,'-')}.pdf`);

async function viewInquilinos() {
  const tenants = await API.tenants.list();
  return `
    <div class="page-head">
      <div><h1>Base de inquilinos</h1><p>${tenants.length} inquilinos en tu cartera</p></div>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Inquilino</th><th>Contacto</th><th>RFC</th><th>Ocupación</th><th>Ingreso</th><th>Solicitudes</th></tr></thead>
          <tbody>
          ${tenants.length ? tenants.map(t => `
            <tr>
              <td><div class="name-cell"><div class="ava">${initials(t.fullName)}</div><div><div>${escapeHtml(t.fullName)}</div><div style="font-size:12px;color:var(--bone-500);font-weight:400">${escapeHtml(t.employer||'')}</div></div></div></td>
              <td style="font-size:13px"><div>${escapeHtml(t.email)}</div><div style="color:var(--bone-500)">${escapeHtml(t.phone)}</div></td>
              <td style="font-family:monospace;font-size:13px">${escapeHtml(t.rfc||'—')}</td>
              <td>${escapeHtml(t.occupation||'—')}</td>
              <td><strong>${t.monthlyIncome?fmtMx(t.monthlyIncome):'—'}</strong></td>
              <td>${t._count.requests}</td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">Sin inquilinos aún</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function viewReportes() {
  const reports = await API.reports.list();
  if (!reports.length) return `<div class="empty"><div class="icon-big">📑</div><h3>Sin reportes aún</h3><p>Los Multireportes aparecerán aquí al validar solicitudes.</p></div>`;

  const avg = Math.round(reports.reduce((s,r)=>s+r.score,0)/reports.length);
  return `
    <div class="page-head"><div><h1>Multireportes</h1><p>${reports.length} reportes generados</p></div></div>
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Reportes totales</div><div class="val">${reports.length}</div></div>
      <div class="kpi accent"><div class="lbl">Score promedio</div><div class="val">${avg}</div></div>
      <div class="kpi"><div class="lbl">Aprobados</div><div class="val">${reports.filter(r=>r.score>=70).length}</div></div>
      <div class="kpi"><div class="lbl">Rechazados</div><div class="val">${reports.filter(r=>r.score<70).length}</div></div>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Inquilino</th><th>Score</th><th>Riesgo</th><th>Identidad</th><th>Crediticio</th><th>Legal</th><th>Listas negras</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
          ${reports.map(r => `
            <tr>
              <td><div class="name-cell"><div class="ava">${initials(r.request.tenant.fullName)}</div>${escapeHtml(r.request.tenant.fullName)}</div></td>
              <td><strong style="font-size:18px;color:${r.score>=70?'var(--green-500)':'var(--red-500)'}">${r.score}</strong></td>
              <td><span class="status-pill ${r.fraudRisk==='low'?'ok':r.fraudRisk==='medium'?'rev':'rej'}">${r.fraudRisk}</span></td>
              <td>${r.identityOk?'✅':'❌'}</td>
              <td>${r.creditOk?'✅':'⚠️'}</td>
              <td>${r.legalOk?'✅':'❌'}</td>
              <td>${r.blacklistOk?'✅ Limpio':'🚫 Detectado'}</td>
              <td style="color:var(--bone-500);font-size:13px">${fmtDate(r.generatedAt)}</td>
              <td><button class="btn btn-icon" onclick="downloadReport('${r.id}', '${escapeHtml(r.request.tenant.fullName)}')" title="Descargar PDF">📄</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function viewContratos() {
  const contracts = await API.contracts.list();
  return `
    <div class="page-head"><div><h1>Contratos</h1><p>${contracts.length} contratos generados</p></div></div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Inquilino</th><th>Inicio</th><th>Fin</th><th>Renta</th><th>Depósito</th><th>Estado</th><th></th></tr></thead>
          <tbody>
          ${contracts.length ? contracts.map(c => `
            <tr>
              <td><div class="name-cell"><div class="ava">${initials(c.tenant.fullName)}</div>${escapeHtml(c.tenant.fullName)}</div></td>
              <td>${fmtDate(c.startDate)}</td>
              <td>${fmtDate(c.endDate)}</td>
              <td><strong>${fmtMx(c.monthlyRent)}</strong></td>
              <td>${fmtMx(c.deposit)}</td>
              <td><span class="status-pill ${c.status==='activo'?'ok':'rev'}">${c.status}</span></td>
              <td><button class="btn btn-icon" onclick="downloadContract('${c.id}', '${escapeHtml(c.tenant.fullName)}')" title="PDF">📄</button></td>
            </tr>`).join('') : `<tr><td colspan="7" class="empty">Sin contratos aún. Genera uno desde una solicitud validada.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function viewProteccion() {
  const policies = await API.policies.list();
  const totalCov = policies.reduce((s,p)=>s+p.coverage,0);
  return `
    <div class="page-head"><div><h1>Pólizas de protección</h1><p>${policies.length} pólizas activas</p></div></div>
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Pólizas activas</div><div class="val">${policies.filter(p=>p.status==='activa').length}</div></div>
      <div class="kpi accent"><div class="lbl">Cobertura total</div><div class="val">${fmtMx(totalCov)}</div></div>
      <div class="kpi"><div class="lbl">Premium</div><div class="val">${policies.filter(p=>p.plan==='premium').length}</div></div>
      <div class="kpi"><div class="lbl">Estándar</div><div class="val">${policies.filter(p=>p.plan==='multiproteccion').length}</div></div>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Póliza</th><th>Inquilino</th><th>Plan</th><th>Cobertura</th><th>Vigencia</th><th>Estado</th></tr></thead>
          <tbody>
          ${policies.length ? policies.map(p => `
            <tr>
              <td style="font-family:monospace;font-size:13px">${p.policyNumber}</td>
              <td><div class="name-cell"><div class="ava">${initials(p.request.tenant.fullName)}</div>${escapeHtml(p.request.tenant.fullName)}</div></td>
              <td><strong>${planLabel(p.plan)}</strong></td>
              <td>${fmtMx(p.coverage)}</td>
              <td style="font-size:13px">${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</td>
              <td><span class="status-pill ok">${p.status}</span></td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">Sin pólizas aún</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function viewPagos() {
  const payments = await API.payments.list();
  const paid = payments.filter(p=>p.status==='paid');
  const pending = payments.filter(p=>p.status==='pending');
  const totalPaid = paid.reduce((s,p)=>s+p.amount,0);
  const totalPending = pending.reduce((s,p)=>s+p.amount,0);

  return `
    <div class="page-head"><div><h1>Pagos y facturación</h1><p>${payments.length} transacciones</p></div></div>
    <div class="kpi-grid">
      <div class="kpi accent"><div class="lbl">Total cobrado</div><div class="val">${fmtMx(totalPaid)}</div></div>
      <div class="kpi"><div class="lbl">Pendiente</div><div class="val">${fmtMx(totalPending)}</div></div>
      <div class="kpi"><div class="lbl">Transacciones</div><div class="val">${payments.length}</div></div>
      <div class="kpi"><div class="lbl">Ticket promedio</div><div class="val">${fmtMx(paid.length?totalPaid/paid.length:0)}</div></div>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Referencia</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody>
          ${payments.map(p => `
            <tr>
              <td>${fmtDate(p.paidAt || p.createdAt)}</td>
              <td>${escapeHtml(p.concept)}</td>
              <td style="font-size:13px;color:var(--bone-500)">${escapeHtml(p.method)}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--bone-500)">${escapeHtml(p.reference||'-')}</td>
              <td><strong>${fmtMx(p.amount)}</strong></td>
              <td><span class="status-pill ${p.status==='paid'?'ok':p.status==='pending'?'rev':'rej'}">${p.status==='paid'?'Pagado':p.status==='pending'?'Pendiente':'Fallido'}</span></td>
              <td>${p.status==='pending'?`<button class="btn btn-sm btn-primary" onclick="capturePayment('${p.id}')">Cobrar</button>`:''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.capturePayment = async (id) => {
  if (!confirm('¿Confirmar cobro?')) return;
  try { await API.payments.charge(id); route(); } catch (e) { alert('Error: '+e.message); }
};

async function viewComparador() {
  const allReqs = await API.requests.list({});
  // Agrupar por propertyAddress para encontrar candidatos competidores
  const groups = {};
  allReqs.forEach(r => {
    const key = r.propertyAddress.toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  const competitive = Object.entries(groups).filter(([k, arr]) => arr.length >= 2);

  return `
    <div class="page-head">
      <div><h1>Comparador de candidatos</h1><p>Pon lado a lado los inquilinos que compiten por el mismo inmueble</p></div>
    </div>

    ${competitive.length === 0 ? `
      <div class="card">
        <div class="empty">
          <div class="icon-big">⚖️</div>
          <h3>Aún no hay inmuebles con múltiples candidatos</h3>
          <p style="margin:14px 0 22px">El comparador se activa automáticamente cuando 2 o más solicitudes apuntan al mismo inmueble.</p>
          <p style="font-size:13px;color:var(--bone-400)">Para probarlo: crea 2 solicitudes con la <strong>misma dirección de inmueble</strong> y regresa a esta vista.</p>
        </div>
      </div>
    ` : competitive.map(([property, reqs]) => {
        // Ranking: el mejor score gana
        const ranked = [...reqs].sort((a,b) => (b.report?.score || 0) - (a.report?.score || 0));
        const winnerId = ranked[0]?.report ? ranked[0].id : null;
        const cols = reqs.length === 2 ? 'cols-2' : 'cols-3';
        return `
          <div style="margin-bottom:36px">
            <h2 style="font-family:var(--font-display);font-size:20px;color:var(--indigo-900);margin-bottom:6px">📍 ${escapeHtml(reqs[0].propertyAddress)}</h2>
            <p style="color:var(--bone-500);font-size:14px;margin-bottom:18px">${reqs.length} candidatos · Renta ${fmtMx(reqs[0].monthlyRent)}/mes</p>
            <div class="compare-grid ${cols}">
              ${ranked.slice(0,3).map(r => {
                const t = r.tenant;
                const score = r.report?.score;
                const isWinner = r.id === winnerId;
                return `
                  <div class="compare-card ${isWinner?'winner':''}">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
                      <div class="ava" style="width:44px;height:44px;font-size:14px">${initials(t.fullName)}</div>
                      <div>
                        <div style="font-family:var(--font-display);font-weight:700;color:var(--indigo-900);font-size:16px">${escapeHtml(t.fullName)}</div>
                        <div style="font-size:12px;color:var(--bone-500)">${escapeHtml(t.occupation || '—')}</div>
                      </div>
                    </div>
                    <div style="text-align:center;padding:14px 0;background:var(--bone-50);border-radius:10px;margin-bottom:14px">
                      <div style="font-size:11px;color:var(--bone-500);text-transform:uppercase;letter-spacing:1.5px;font-weight:600">Score</div>
                      <div style="font-family:var(--font-display);font-size:42px;font-weight:700;color:${score>=70?'var(--green-500)':score?'var(--red-500)':'var(--bone-400)'};letter-spacing:-.02em;line-height:1">${score ?? '—'}</div>
                      ${score ? `<div style="font-size:12px;color:var(--bone-500);margin-top:4px">${payProbability(score)}% prob. pago 12m</div>` : ''}
                    </div>
                    <div style="display:grid;gap:8px;font-size:13px">
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Ingreso</span><strong>${t.monthlyIncome?fmtMx(t.monthlyIncome):'—'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Capacidad</span><strong style="color:${r.report?.capacityRatio>=3?'var(--green-500)':'var(--amber-500)'}">${r.report?.capacityRatio?r.report.capacityRatio+'x':'—'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Identidad</span><strong>${r.report?.identityOk?'✅':r.report?'❌':'⏳'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Crediticio</span><strong>${r.report?.creditOk?'✅':r.report?'⚠️':'⏳'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Legal</span><strong>${r.report?.legalOk?'✅':r.report?'❌':'⏳'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Listas negras</span><strong>${r.report?.blacklistOk?'✅':r.report?'🚫':'⏳'}</strong></div>
                      <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Fiador</span><strong>${r.withFiador?'Sí':'No'}</strong></div>
                    </div>
                    <a href="#/solicitud/${r.id}" class="btn btn-outline btn-block" style="margin-top:18px">Ver detalle →</a>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
  `;
}

async function viewEquipo() {
  const users = await API.users.list();
  return `
    <div class="page-head">
      <div><h1>Equipo</h1><p>${users.length} miembros en ${escapeHtml(SESSION.organization.name)}</p></div>
      <button class="btn btn-primary" onclick="inviteMember()">+ Invitar miembro</button>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Miembro</th><th>Correo</th><th>Rol</th><th>Último acceso</th><th>Estado</th></tr></thead>
          <tbody>
          ${users.map(u => `
            <tr>
              <td><div class="name-cell"><div class="ava">${initials(u.name)}</div><div><div>${escapeHtml(u.name)}</div>${u.id===SESSION.user.id?'<div style="font-size:12px;color:var(--bone-500)">Tú</div>':''}</div></div></td>
              <td>${escapeHtml(u.email)}</td>
              <td><span class="status-pill ${u.role==='admin'?'new':'rev'}">${u.role==='admin'?'Administrador':u.role==='asesor'?'Asesor':'Lector'}</span></td>
              <td style="font-size:13px;color:var(--bone-500)">${u.lastLoginAt?fmtDate(u.lastLoginAt):'Nunca'}</td>
              <td><span class="status-pill ${u.active?'ok':'rej'}">${u.active?'Activo':'Inactivo'}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.inviteMember = async () => {
  const name = prompt('Nombre del miembro:');
  if (!name) return;
  const email = prompt('Correo:');
  if (!email) return;
  const role = prompt('Rol (admin / asesor / viewer):', 'asesor') || 'asesor';
  try {
    const r = await API.users.invite({ name, email, role });
    alert(`✅ Usuario creado.\nCorreo: ${r.email}\nContraseña temporal: ${r.temporaryPassword}`);
    route();
  } catch (e) { alert('Error: '+e.message); }
};

async function viewOrganizacion() {
  const org = await API.organization.get();
  return `
    <div class="page-head">
      <div><h1>Organización</h1><p>Datos y configuración de ${escapeHtml(org.name)}</p></div>
    </div>
    <div class="two-col">
      <div class="card">
        <div class="card-head"><h3>Datos de la empresa</h3></div>
        <form onsubmit="saveOrg(event)">
          <div class="form-grid">
            <div class="field"><label>Nombre</label><input name="name" value="${escapeHtml(org.name)}" required></div>
            <div class="field"><label>RFC</label><input name="rfc" value="${escapeHtml(org.rfc||'')}"></div>
            <div class="field"><label>Teléfono</label><input name="phone" value="${escapeHtml(org.phone||'')}"></div>
            <div class="field"><label>Plan</label><input value="${escapeHtml(org.plan)}" disabled></div>
            <div class="field field-full"><label>Dirección</label><input name="address" value="${escapeHtml(org.address||'')}"></div>
            <div class="field field-full"><label>Webhook URL (integraciones)</label><input name="webhookUrl" value="${escapeHtml(org.webhookUrl||'')}" placeholder="https://hooks.zapier.com/..."></div>
            <div class="field field-full"><label>API Key</label><input value="${escapeHtml(org.apiKey)}" readonly style="font-family:monospace;font-size:12px;background:var(--bone-50)"></div>
          </div>
          <button class="btn btn-primary" type="submit" style="margin-top:14px">Guardar cambios</button>
        </form>
      </div>
      <div>
        <div class="card" style="margin-bottom:20px">
          <div class="card-head"><h3>Estadísticas</h3></div>
          <div style="display:grid;gap:10px;font-size:14px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Usuarios</span><strong>${org._count.users}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Inquilinos</span><strong>${org._count.tenants}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Solicitudes</span><strong>${org._count.requests}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Contratos</span><strong>${org._count.contracts}</strong></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--bone-500)">Pagos</span><strong>${org._count.payments}</strong></div>
          </div>
        </div>
        <div class="card" style="border-color:var(--red-100);background:#fff5f5">
          <div class="card-head"><h3 style="color:var(--red-500)">Zona de peligro</h3></div>
          <p style="font-size:13px;color:var(--bone-600);margin-bottom:14px">Estas acciones son irreversibles.</p>
          <button class="btn btn-outline" style="border-color:var(--red-500);color:var(--red-500)" onclick="$('#logout-btn').click()">Cerrar sesión</button>
        </div>
      </div>
    </div>
  `;
}
window.saveOrg = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await API.organization.update(Object.fromEntries(f));
    alert('✅ Cambios guardados');
    route();
  } catch (err) { alert('Error: '+err.message); }
};

/* ===== NEW REQUEST ===== */

window.openNewRequest = () => $('#modal-new').classList.add('open');
$('#quick-new').addEventListener('click', () => openNewRequest());
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal-overlay').classList.remove('open')));
$$('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o && o.id !== 'auth-gate') o.classList.remove('open'); }));

$('#new-req-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const tenantData = {
    fullName: f.get('fullName'), email: f.get('email'), phone: f.get('phone'),
    rfc: f.get('rfc'), occupation: f.get('occupation'),
    monthlyIncome: f.get('monthlyIncome') ? parseFloat(f.get('monthlyIncome')) : null
  };
  const payload = {
    tenantData,
    propertyAddress: f.get('propertyAddress'),
    monthlyRent: parseFloat(f.get('monthlyRent')),
    plan: f.get('plan'),
    withFiador: f.get('withFiador') === 'true',
    withCorporate: f.get('withCorporate') === 'true'
  };
  try {
    const r = await API.requests.create(payload);
    $('#modal-new').classList.remove('open');
    e.target.reset();
    alert(`✅ Solicitud creada. Liga enviada al inquilino:\n${r.publicUrl}`);
    location.hash = '#/solicitud/' + r.request.id;
  } catch (err) { alert('Error: '+err.message); }
});

/* ===== ROUTER ===== */

const routes = {
  dashboard: { title: 'Dashboard', view: viewDashboard },
  solicitudes: { title: 'Solicitudes', view: viewSolicitudes },
  comparador: { title: 'Comparador', view: viewComparador },
  inquilinos: { title: 'Inquilinos', view: viewInquilinos },
  reportes: { title: 'Multireportes', view: viewReportes },
  contratos: { title: 'Contratos', view: viewContratos },
  proteccion: { title: 'Pólizas', view: viewProteccion },
  pagos: { title: 'Pagos', view: viewPagos },
  equipo: { title: 'Equipo', view: viewEquipo },
  organizacion: { title: 'Organización', view: viewOrganizacion }
};

async function route() {
  if (!SESSION) return;
  const hash = location.hash.replace('#/', '') || 'dashboard';
  const parts = hash.split('/');
  const key = parts[0];

  $$('.sidebar-nav a[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  $('#view').innerHTML = '<div class="empty"><div class="icon-big">⏳</div>Cargando...</div>';

  try {
    if (key === 'solicitud' && parts[1]) {
      $('#page-title').textContent = 'Detalle de solicitud';
      $('#view').innerHTML = await viewSolicitudDetail(parts[1]);
      return;
    }
    const r = routes[key] || routes.dashboard;
    $('#page-title').textContent = r.title;
    $('#view').innerHTML = await r.view();
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="empty"><div class="icon-big">⚠️</div><h3>Error al cargar</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

window.addEventListener('hashchange', route);

/* ===== BOOT ===== */

(async () => {
  if (API.getToken()) {
    try {
      const me = await API.auth.me();
      SESSION = { user: me.user, organization: me.organization, token: API.getToken() };
      afterAuth();
      return;
    } catch { API.clearToken(); }
  }
  openAuth();
})();
