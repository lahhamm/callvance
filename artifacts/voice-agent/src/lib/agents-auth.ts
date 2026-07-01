const AGENTS_ADMIN_TOKEN_KEY = "agents_admin_token";
const AGENTS_TENANT_TOKEN_KEY = "agents_tenant_token";
const AGENTS_TENANT_ID_KEY = "agents_tenant_id";
const AGENTS_TENANT_NAME_KEY = "agents_tenant_name";

export function setAgentsAdminSession(token: string): void {
  localStorage.setItem(AGENTS_ADMIN_TOKEN_KEY, token);
  localStorage.removeItem(AGENTS_TENANT_TOKEN_KEY);
  localStorage.removeItem(AGENTS_TENANT_ID_KEY);
  localStorage.removeItem(AGENTS_TENANT_NAME_KEY);
}

export function setAgentsTenantSession(token: string, tenantId: number, tenantName: string): void {
  localStorage.setItem(AGENTS_TENANT_TOKEN_KEY, token);
  localStorage.setItem(AGENTS_TENANT_ID_KEY, String(tenantId));
  localStorage.setItem(AGENTS_TENANT_NAME_KEY, tenantName);
  localStorage.removeItem(AGENTS_ADMIN_TOKEN_KEY);
}

export function getAgentsAdminToken(): string | null {
  return localStorage.getItem(AGENTS_ADMIN_TOKEN_KEY);
}

export function getAgentsTenantToken(): string | null {
  return localStorage.getItem(AGENTS_TENANT_TOKEN_KEY);
}

export function getAgentsTenantId(): number | null {
  const id = localStorage.getItem(AGENTS_TENANT_ID_KEY);
  return id ? Number(id) : null;
}

export function getAgentsTenantName(): string | null {
  return localStorage.getItem(AGENTS_TENANT_NAME_KEY);
}

export function isAgentsAdminAuthenticated(): boolean {
  return !!getAgentsAdminToken();
}

export function isAgentsTenantAuthenticated(): boolean {
  return !!getAgentsTenantToken();
}

export function clearAgentsSession(): void {
  localStorage.removeItem(AGENTS_ADMIN_TOKEN_KEY);
  localStorage.removeItem(AGENTS_TENANT_TOKEN_KEY);
  localStorage.removeItem(AGENTS_TENANT_ID_KEY);
  localStorage.removeItem(AGENTS_TENANT_NAME_KEY);
}

export function agentsAuthHeader(): Record<string, string> {
  const token = getAgentsAdminToken() ?? getAgentsTenantToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
