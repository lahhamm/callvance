import { Router } from "express";
import { generateAdminToken } from "../middlewares/admin-auth";

const router = Router();

router.post("/auth/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nexus2024";

  if (!password || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }

  res.json({ token: generateAdminToken() });
});

export default router;
