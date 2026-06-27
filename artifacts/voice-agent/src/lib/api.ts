import { authHeader } from "./auth";

// In production, set VITE_API_URL to the Express server's base URL
// (e.g. https://callvance.onrender.com) when the frontend is served
// from a different origin. Defaults to "" which means same-origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined ?? "").replace(/\/+$/, "");

export function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  return fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(init?.headers as Record<string, string> ?? {}),
    },
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}
