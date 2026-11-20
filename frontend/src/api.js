const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getToken() {
  return localStorage.getItem('sgd_token');
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('sgd_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, usuario) {
  localStorage.setItem('sgd_token', token);
  localStorage.setItem('sgd_user', JSON.stringify(usuario));
}

export function clearSession() {
  localStorage.removeItem('sgd_token');
  localStorage.removeItem('sgd_user');
}

export async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && endpoint !== '/auth/login') {
    clearSession();
    window.location.reload();
    throw new Error('Sesión expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }
  return data;
}

export async function fetchArchivoBlob(id, inline = false) {
  return fetchBlobUrl(`/documentos/${id}/archivo`, inline);
}

export async function fetchBlobUrl(urlPath, inline = false) {
  const token = getToken();
  const sep = urlPath.includes('?') ? '&' : '?';
  const full = `${API_BASE}${urlPath}${inline ? `${sep}inline=1` : ''}`;
  const res = await fetch(full, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo obtener el archivo');
  }
  return await res.blob();
}
