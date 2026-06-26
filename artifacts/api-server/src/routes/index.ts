import { Router, type IRouter } from "express";
import healthRouter from "./health";
import callsRouter from "./calls";
import authRouter from "./auth";
import adminRouter from "./admin";
import clientPortalRouter from "./client-portal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(clientPortalRouter);
router.use(adminRouter);
router.use(callsRouter);

export default router;
