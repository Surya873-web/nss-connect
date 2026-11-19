import { Router, type IRouter } from "express";
import authRouter from "./auth";
import eventsRouter from "./events";
import healthRouter from "./health";
import staffRouter from "./staff";
import staffRegistrationRouter from "./staff-registration";
import publicRouter from "./public";
import studentRouter from "./student";
import attendanceRouter from "./attendance";
import certificatesRouter from "./certificates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(staffRegistrationRouter);
router.use(publicRouter);
router.use(eventsRouter);
router.use(attendanceRouter);
router.use(certificatesRouter);
router.use(studentRouter);
router.use(staffRouter);

export default router;
