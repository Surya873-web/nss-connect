import { Router, type IRouter } from "express";
import authRouter from "./auth";
import eventsRouter from "./events";
import healthRouter from "./health";
import staffRouter from "./staff";
import publicRouter from "./public";
import studentRouter from "./student";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(publicRouter);
router.use(eventsRouter);
router.use(studentRouter);
router.use(staffRouter);

export default router;
