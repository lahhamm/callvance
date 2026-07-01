import { agentsAuthHeader } from "./agents-auth";

// In production, set VITE_API_URL to the Express server's base URL
// (e.g. https://callvance.onrender.com) when the frontend is served
// from a different origin. Defaults to "" which means same-origin.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined ?? "").replace(/\/+$/, "");

export function agentsApiFetch(path: string, init?: RequestInit): Promise<unknown> {
  return fetch(`${API_BASE}/api/agents${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...agentsAuthHeader(),
      ...(init?.headers as Record<string, string> ?? {}),
    },
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}
