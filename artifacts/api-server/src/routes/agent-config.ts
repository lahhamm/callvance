import { Router } from "express";
import { db, agentConfigTable } from "@workspace/db";
import { UpdateAgentConfigBody } from "@workspace/api-zod";

const router = Router();

async function ensureConfig() {
  const existing = await db.select().from(agentConfigTable).limit(1);
  if (existing.length === 0) {
    const inserted = await db.insert(agentConfigTable).values({}).returning();
    return inserted[0];
  }
  return existing[0];
}

router.get("/agent-config", async (_req, res) => {
  const config = await ensureConfig();
  res.json({
    ...config,
    updatedAt: config.updatedAt.toISOString(),
  });
});

router.patch("/agent-config", async (req, res) => {
  const parsed = UpdateAgentConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  await ensureConfig();
  const updated = await db
    .update(agentConfigTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .returning();
  const config = updated[0];
  res.json({
    ...config,
    updatedAt: config.updatedAt.toISOString(),
  });
});

export default router;
