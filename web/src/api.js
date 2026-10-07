const TOKEN_KEY = 'streamcast.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Thin fetch wrapper: same-origin /api calls with the bearer token attached.
 */
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data);
  return data;
}

export const uploadFile = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api('/uploads', { method: 'POST', body: form, raw: true });
};

/** Reads a file's duration by loading its metadata in the browser. */
export function readDuration(url, type = 'audio') {
  return new Promise((resolve) => {
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    const done = (value) => resolve(Number.isFinite(value) ? Math.round(value) : 0);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
    setTimeout(() => done(el.duration || 0), 6000);
  });
}

export const formatDuration = (seconds) => {
  const total = Number(seconds) || 0;
  if (!total) return '—';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const formatMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

export const timeAgo = (value) => {
  const then = new Date(value).getTime();
  if (!then) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
