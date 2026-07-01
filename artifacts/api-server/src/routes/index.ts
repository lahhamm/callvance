import { Router, type IRouter } from "express";
import healthRouter from "./health";
import callsRouter from "./calls";
import authRouter from "./auth";
import adminRouter from "./admin";
import clientPortalRouter from "./client-portal";
import agentsRouter from "./agents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clientPortalRouter);
router.use(agentsRouter);  // Callvance Agents product — before adminRouter so its global adminAuth never blocks /api/agents
router.use(callsRouter);   // before adminRouter so public routes (webhook, availability) aren't blocked by global adminAuth
router.use(adminRouter);

export default router;
