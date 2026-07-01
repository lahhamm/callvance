import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, tenantsTable, type Tenant } from "@workspace/db";

export const AGENTS_ADMIN_PASSWORD = process.env.AGENTS_ADMIN_PASSWORD || "agents2024";
// Reuse the same SESSION_SECRET (and fallback) as admin-auth.ts.
const SESSION_SECRET = process.env.SESSION_SECRET || "nexus_session_secret_2024";

export function generateAgentsAdminToken(): string {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(AGENTS_ADMIN_PASSWORD)
    .digest("hex");
}

export function agentsAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  if (token !== generateAgentsAdminToken()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function resolveTenantByToken(token: string): Promise<Tenant | null> {
  if (!token) return null;
  const rows = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.accessToken, token))
    .limit(1);
  const tenant = rows[0] ?? null;
  if (!tenant || !tenant.isActive) return null;
  return tenant;
}

// Attaches the resolved tenant to req for downstream handlers.
export interface TenantRequest extends Request {
  tenant?: Tenant;
}

export async function agentsTenantAuth(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const tenant = await resolveTenantByToken(token);
  if (!tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.tenant = tenant;
  next();
}

/**
 * Gates routes shaped like /agents/tenants/:id[/...]. Accepts EITHER:
 *  - the Agents admin token (full access to any tenant), or
 *  - a tenant's own accessToken, but ONLY when req.params.id matches that
 *    tenant's id (self-service — a tenant can never read another tenant's data).
 * This is what lets the tenant portal (/agents/portal) call the same
 * tenant-scoped endpoints the admin dashboard uses, without granting tenants
 * access to the tenant list or other tenants' records.
 */
export async function agentsAdminOrOwnTenantAuth(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);

  if (token === generateAgentsAdminToken()) {
    next();
    return;
  }

  const tenant = await resolveTenantByToken(token);
  const requestedId = Number(req.params.id);
  if (!tenant || tenant.id !== requestedId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.tenant = tenant;
  next();
}
