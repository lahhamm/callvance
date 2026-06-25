import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";
import {
  CreateContactBody,
  UpdateContactBody,
  GetContactParams,
  UpdateContactParams,
  DeleteContactParams,
} from "@workspace/api-zod";

const router = Router();

function serializeContact(c: typeof contactsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    lastCalledAt: c.lastCalledAt ? c.lastCalledAt.toISOString() : null,
  };
}

router.get("/contacts", async (_req, res) => {
  const contacts = await db.select().from(contactsTable).orderBy(contactsTable.createdAt);
  res.json(contacts.map(serializeContact));
});

router.post("/contacts", async (req, res) => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const inserted = await db.insert(contactsTable).values(parsed.data).returning();
  res.status(201).json(serializeContact(inserted[0]));
});

router.get("/contacts/:id", async (req, res) => {
  const params = GetContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const contact = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, params.data.id))
    .limit(1);
  if (!contact[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeContact(contact[0]));
});

router.patch("/contacts/:id", async (req, res) => {
  const params = UpdateContactParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateContactBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const updated = await db
    .update(contactsTable)
    .set(body.data)
    .where(eq(contactsTable.id, params.data.id))
    .returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeContact(updated[0]));
});

router.delete("/contacts/:id", async (req, res) => {
  const params = DeleteContactParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(contactsTable).where(eq(contactsTable.id, params.data.id));
  res.status(204).send();
});

export default router;
