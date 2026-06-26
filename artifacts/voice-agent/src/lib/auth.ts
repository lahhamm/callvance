const ADMIN_TOKEN_KEY = "callvance_admin_token";
const CLIENT_TOKEN_KEY = "callvance_client_token";
const CLIENT_ID_KEY = "callvance_client_id";
const CLIENT_NAME_KEY = "callvance_client_name";

export function setAdminSession(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
  localStorage.removeItem(CLIENT_NAME_KEY);
}

export function setClientSession(token: string, clientId: number, clientName: string): void {
  localStorage.setItem(CLIENT_TOKEN_KEY, token);
  localStorage.setItem(CLIENT_ID_KEY, String(clientId));
  localStorage.setItem(CLIENT_NAME_KEY, clientName);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getClientToken(): string | null {
  return localStorage.getItem(CLIENT_TOKEN_KEY);
}

export function getClientId(): number | null {
  const id = localStorage.getItem(CLIENT_ID_KEY);
  return id ? Number(id) : null;
}

export function getClientName(): string | null {
  return localStorage.getItem(CLIENT_NAME_KEY);
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminToken();
}

export function isClientAuthenticated(): boolean {
  return !!getClientToken();
}

export function isAuthenticated(): boolean {
  return isAdminAuthenticated() || isClientAuthenticated();
}

export function clearSession(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
  localStorage.removeItem(CLIENT_NAME_KEY);
}

export function authHeader(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// legacy compat
export function getToken(): string | null { return getAdminToken(); }
export function setToken(token: string): void { setAdminSession(token); }
export function clearToken(): void { clearSession(); }
