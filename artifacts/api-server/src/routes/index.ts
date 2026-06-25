import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentConfigRouter from "./agent-config";
import contactsRouter from "./contacts";
import callsRouter from "./calls";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentConfigRouter);
router.use(contactsRouter);
router.use(callsRouter);

export default router;
