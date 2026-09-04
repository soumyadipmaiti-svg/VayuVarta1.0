// Dev: Vite proxies /api → http://localhost:8000 (vite.config.ts)
// Prod: set VITE_API_BASE to your deployed backend, e.g.
//   https://vayuvarta-api.onrender.com/api/v1
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') || '/api/v1';

let _token: string | null = null;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) h['Authorization'] = `Bearer ${_token}`;
  return h;
}

// FastAPI can return `detail` as a string (HTTPException), an array of
// validation-error objects (422), or an object. Turn any shape into a
// readable message so users never see "[object Object]".
function detailMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d: any) => (d && typeof d === 'object' ? d.msg : String(d)))
      .filter(Boolean);
    if (parts.length) return parts.join('. ');
  }
  if (detail && typeof detail === 'object') {
    const d = detail as any;
    if (typeof d.msg === 'string') return d.msg;
    if (typeof d.detail === 'string') return d.detail;
  }
  return `Request failed (${status})`;
}

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null as T;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: any = new Error(detailMessage(data.detail, r.status));
    err.code = data.code || r.headers.get('x-error-code') || undefined;
    err.status = r.status;
    throw err;
  }
  return data as T;
}

export const api = {
  setToken(t: string | null) { _token = t; },

  // Auth
  register: (d: { name: string; email: string; password: string }) => req('POST', '/auth/register', d),
  login: (d: { email: string; password: string }) => req<{ token: string; user: any }>('POST', '/auth/login', d),
  me: () => req<any>('GET', '/auth/me'),
  logout: () => req('POST', '/auth/logout'),
  forgotPassword: (email: string) => req<{ message: string }>('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) => req<{ message: string }>('POST', '/auth/reset-password', { token, new_password: newPassword }),

  // Weather
  weather: (lid: string) => req('GET', `/weather/current?location_id=${lid}`),
  forecast: (lid: string, type = 'daily') => req('GET', `/weather/forecast?location_id=${lid}&type=${type}`),
  historical: (lid: string, month: number) => req('GET', `/weather/historical?location_id=${lid}&month=${month}`),
  geocode: (q: string) => req<{ results: any[] }>(`GET`, `/weather/geocode?q=${encodeURIComponent(q)}`),

  // Locations
  locations: () => req<any[]>('GET', '/locations'),
  addLocation: (d: { name: string; latitude: number; longitude: number; label?: string }) => req('POST', '/locations', d),
  deleteLocation: (id: string) => req('DELETE', `/locations/${id}`),
  setDefault: (id: string) => req('PATCH', `/locations/${id}/default`),

  // Alerts
  alerts: () => req<any[]>('GET', '/alerts'),
  subscriptions: () => req<any[]>('GET', '/alerts/subscriptions'),
  createSubscription: (d: { location_id: string; event_type: string; threshold_value?: number }) => req('POST', '/alerts/subscriptions', d),
  updateSubscription: (id: string, d: { threshold_value?: number; enabled?: boolean }) => req('PATCH', `/alerts/subscriptions/${id}`, d),
  deleteSubscription: (id: string) => req('DELETE', `/alerts/subscriptions/${id}`),

  // AI
  askAI: (d: { location_id: string; message: string }) => req<{ reply: string }>('POST', '/ai/ask', d),
  askAIStream: async function* (d: { location_id: string; message: string }): AsyncGenerator<string, void, unknown> {
    const r = await fetch(`${BASE}/ai/ask-stream`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(detailMessage(err.detail, r.status));
    }
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) yield data.token;
            if (data.done) return;
          } catch { /* skip malformed */ }
        }
      }
    }
  },
  conversations: (lid: string) => req<any[]>('GET', `/ai/conversations?location_id=${lid}`),

  // 🚨 Alarms
  getAlarms: (activeOnly = true) => req<any[]>('GET', `/alarms?active_only=${activeOnly}`),
  ackAlarm: (id: string) => req('POST', `/alarms/${id}/ack`),
  getRisk: (locationId: string) => req<any>('GET', `/alarms/risk/${locationId}`),
  getAlarmStats: () => req<any>('GET', '/alarms/stats'),
  triggerTestAlarm: () => req<any>('POST', '/alarms/test'),

  // Push
  pushVapidKey: () => req<{ public_key: string }>('GET', '/push/vapid-public-key'),
};
