import { Router } from "express";
import { getDashboardStats, getProfessionalDashboardStats, getProfessionalPendingQuestions, listDashboardUsers, getInvoiceAnalytics } from "../Controllers/Dashboard.controller.js";
import { verifyAdmin, verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.get("/stats", verifyJWT, verifyAdmin, getDashboardStats);
router.get("/users", verifyJWT, verifyAdmin, listDashboardUsers);
router.get("/invoice-analytics", verifyJWT, verifyAdmin, getInvoiceAnalytics);
router.get("/stats/prof", verifyJWT, getProfessionalDashboardStats);
router.get("/pending", verifyJWT, getProfessionalPendingQuestions);

export default router;