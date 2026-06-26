import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { generateAdminToken } from "../middlewares/admin-auth";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) { res.status(400).json({ error: "Password required" }); return; }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nexus2024";
  if (password === ADMIN_PASSWORD) {
    res.json({ type: "admin", token: generateAdminToken() });
    return;
  }

  const clients = await db.select().from(clientsTable)
    .where(eq(clientsTable.portalPassword, password))
    .limit(1);

  if (clients[0]) {
    const client = clients[0];
    res.json({
      type: "client",
      token: client.accessToken,
      clientId: client.id,
      clientName: client.name,
    });
    return;
  }

  res.status(401).json({ error: "Invalid password" });
});

export default router;
