// Cliente HTTP para InmoBuró API
const API_BASE = '/api';

function getToken() { return localStorage.getItem('mb_token'); }
function setToken(t) { localStorage.setItem('mb_token', t); }
function clearToken() { localStorage.removeItem('mb_token'); localStorage.removeItem('mb_user'); localStorage.removeItem('mb_org'); }

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  const t = getToken();
  if (t) opts.headers.Authorization = 'Bearer ' + t;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API_BASE + path, opts);
  if (r.status === 401) {
    clearToken();
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/') location.href = '/index.html';
    throw new Error('No autenticado');
  }
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data.error || 'Error en la solicitud');
  return data;
}

window.API = {
  auth: {
    signup: (d) => request('POST', '/auth/signup', d),
    login:  (d) => request('POST', '/auth/login',  d),
    me:     ()  => request('GET',  '/auth/me'),
    updateMe: (d) => request('PATCH','/auth/me', d)
  },
  organization: {
    get: () => request('GET', '/organization/me'),
    update: (d) => request('PATCH', '/organization/me', d)
  },
  users: {
    list: () => request('GET', '/users'),
    invite: (d) => request('POST', '/users', d),
    update: (id, d) => request('PATCH', '/users/'+id, d)
  },
  tenants: {
    list: (q) => request('GET', '/tenants' + (q?`?q=${encodeURIComponent(q)}`:'')),
    get: (id) => request('GET', '/tenants/'+id),
    create: (d) => request('POST', '/tenants', d),
    update: (id, d) => request('PATCH', '/tenants/'+id, d)
  },
  requests: {
    list: (filters={}) => request('GET', '/requests?' + new URLSearchParams(filters)),
    get: (id) => request('GET', '/requests/'+id),
    create: (d) => request('POST', '/requests', d),
    advance: (id) => request('PATCH', '/requests/'+id+'/advance'),
    reject: (id, reason) => request('PATCH', '/requests/'+id+'/reject', { reason })
  },
  reports: {
    list: () => request('GET', '/reports'),
    get: (id) => request('GET', '/reports/'+id),
    pdfUrl: (id) => `${API_BASE}/reports/${id}/pdf?token=${getToken()}`
  },
  contracts: {
    list: () => request('GET', '/contracts'),
    get: (id) => request('GET', '/contracts/'+id),
    fromRequest: (reqId) => request('POST', '/contracts/from-request/'+reqId),
    pdfUrl: (id) => `${API_BASE}/contracts/${id}/pdf?token=${getToken()}`
  },
  policies: {
    list: () => request('GET', '/policies')
  },
  payments: {
    list: () => request('GET', '/payments'),
    charge: (id) => request('POST', '/payments/'+id+'/charge')
  },
  activity: {
    list: (limit=20) => request('GET', '/activity?limit='+limit)
  },
  dashboard: {
    stats: () => request('GET', '/dashboard/stats'),
    search: (q) => request('GET', '/dashboard/search?q='+encodeURIComponent(q))
  },
  // PDF download helper (uses fetch with auth header, returns blob URL)
  async downloadPdf(path, filename) {
    const r = await fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + getToken() }});
    if (!r.ok) throw new Error('PDF no disponible');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  setToken, getToken, clearToken
};
