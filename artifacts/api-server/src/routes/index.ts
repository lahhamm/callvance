import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentConfigRouter from "./agent-config";
import contactsRouter from "./contacts";
import callsRouter from "./calls";
import chatRouter from "./chat";
import availabilityRouter from "./availability";
import bookingsRouter from "./bookings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentConfigRouter);
router.use(contactsRouter);
router.use(callsRouter);
router.use(chatRouter);
router.use(availabilityRouter);
router.use(bookingsRouter);

export default router;
