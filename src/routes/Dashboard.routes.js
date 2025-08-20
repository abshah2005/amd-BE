import { Router } from "express";
import { getDashboardStats, listDashboardUsers } from "../Controllers/Dashboard.controller.js";
import { verifyAdmin, verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.get("/stats", verifyJWT,verifyAdmin, getDashboardStats);
router.get("/users", verifyJWT,verifyAdmin, listDashboardUsers);

export default router;