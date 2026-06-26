import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nexus2024";
const SESSION_SECRET = process.env.SESSION_SECRET || "nexus_session_secret_2024";

export function generateAdminToken(): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(ADMIN_PASSWORD).digest("hex");
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const expected = generateAdminToken();
  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
