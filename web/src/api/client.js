/**
 * Typed-ish API client for the Glide backend.
 * Base URL is overridable so the web app can point at a LAN backend.
 */

import { cloudDashboardState, cloudUser, cloudChat, cloudSuggestions } from './cloud';

const STORAGE_TOKEN = 'glide_token';
const STORAGE_BASE = 'glide_api_base';

export function getBaseUrl() {
  return localStorage.getItem(STORAGE_BASE) || 'http://127.0.0.1:8080';
}

export function setBaseUrl(url) {
  localStorage.setItem(STORAGE_BASE, url.replace(/\/$/, ''));
}

export function getToken() {
  return localStorage.getItem(STORAGE_TOKEN);
}

export function setToken(token) {
  if (token) localStorage.setItem(STORAGE_TOKEN, token);
  else localStorage.removeItem(STORAGE_TOKEN);
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, auth = true, timeout = 180000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError('The request timed out. Is the backend running?', 0, null);
    }
    throw new ApiError(
      `Cannot reach the Glide backend at ${getBaseUrl()}. Start it with: python -m app.main`,
      0,
      null,
    );
  }
  clearTimeout(timer);

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    if (response.status === 401) setToken(null);
    throw new ApiError(
      payload?.detail || payload?.error || `Request failed (${response.status})`,
      response.status,
      payload,
    );
  }
  return payload;
}

/**
 * Backend-optional wrappers.
 *
 * The Flask service lives on localhost, so a deployed build can never reach
 * it. Anything that has a cloud equivalent falls back to Firestore; anything
 * that is genuinely backend-only resolves empty so the page renders a real
 * empty state instead of an error wall.
 */
async function orCloud(backendCall, cloudCall) {
  try {
    return await backendCall();
  } catch {
    return await cloudCall();
  }
}

async function orEmpty(backendCall, fallback) {
  try {
    return await backendCall();
  } catch {
    return fallback;
  }
}

export const api = {
  health: () => request('/health', { auth: false }),

  // --- auth ---------------------------------------------------------------
  signup: (email, password, name) =>
    request('/auth/signup', { method: 'POST', auth: false, body: { email, password, name } }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', auth: false, body: { email, password } }),
  me: () => request('/auth/me'),

  // --- profile ------------------------------------------------------------
  getProfile: () => orEmpty(() => request('/profile'), { user: cloudUser() || {} }),
  updateProfile: (patch) =>
    orEmpty(() => request('/profile', { method: 'PATCH', body: patch }), { user: { ...(cloudUser() || {}), ...patch } }),

  // --- state --------------------------------------------------------------
  dashboardState: (days = 30) =>
    orCloud(() => request(`/dashboard/state?days=${days}`), () => cloudDashboardState()),
  projection: (days = 30) => request(`/dashboard/projection?days=${days}`),
  timeline: (days = 30) => request(`/dashboard/timeline?days=${days}`),
  obligations: () => request('/obligations'),

  // --- transactions -------------------------------------------------------
  transactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    // Per-transaction rows never leave the phone, so the cloud path has none.
    return orEmpty(() => request(`/transactions${query ? `?${query}` : ''}`), { transactions: [] });
  },
  createTransaction: (txn) => request('/transactions', { method: 'POST', body: txn }),
  updateTransaction: (id, patch) => request(`/transactions/${id}`, { method: 'PATCH', body: patch }),
  reviewQueue: () => request('/transactions/review'),

  // --- agent --------------------------------------------------------------
  insights: (status = 'active') =>
    orEmpty(() => request(`/insights?status=${status}`), { insights: [] }),
  dismissInsight: (id) => request(`/insights/${id}/dismiss`, { method: 'POST' }),
  actInsight: (id) => request(`/insights/${id}/act`, { method: 'POST' }),
  tick: (useLlm = false) =>
    orEmpty(() => request('/agent/tick', { method: 'POST', body: { use_llm: useLlm } }), { surfaced: [] }),
  agentRuns: (limit = 25) => orEmpty(() => request(`/agent/runs?limit=${limit}`), { runs: [] }),

  // --- chat ---------------------------------------------------------------
  chat: (message) =>
    orCloud(() => request('/chat', { method: 'POST', body: { message } }), () => cloudChat(message)),
  chatHistory: () => orEmpty(() => request('/chat/history'), { messages: [] }),
  clearChat: () => request('/chat/history', { method: 'DELETE' }),
  chatSuggestions: () => orCloud(() => request('/chat/suggestions'), () => cloudSuggestions()),

  // --- ingestion ----------------------------------------------------------
  ingestSms: (body, sender) => request('/sms/ingest', { method: 'POST', body: { body, sender } }),
  smsStatus: () => request('/sms/status'),

};

export { ApiError };

/** Rs.12,345 -- the app never renders a bare number without its unit. */
export function formatCurrency(value, { compact = false } = {}) {
  const number = Number(value || 0);
  if (compact && Math.abs(number) >= 1000) {
    return `Rs.${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  }
  return `Rs.${number.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatRelative(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
