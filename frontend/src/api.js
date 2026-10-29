const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'customer-hub-token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
};
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  // 401 on login means bad credentials; elsewhere it means the session is gone
  if (res.status === 401 && path !== '/api/auth/login') {
    clearToken();
    onUnauthorized();
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  register: (u) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(u) }),
  login: (u) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(u) }),
  me: () => request('/api/auth/me'),
  list: () => request('/api/customers'),
  create: (c) => request('/api/customers', { method: 'POST', body: JSON.stringify(c) }),
  update: (id, c) => request(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(c) }),
  remove: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),
  ask: (message, history) =>
    request('/api/agent', { method: 'POST', body: JSON.stringify({ message, history }) }),
};

export const SWAGGER_URL = `${BASE}/swagger`;
