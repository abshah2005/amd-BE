import { Router } from "express";
import { getOnboardingStatus, onboardProfessionalToStripe, getStripeDashboardLink,processBacklogPayments } from "../Controllers/Onboarding.Controller.js";

const router = Router();

router.post("/stripe", onboardProfessionalToStripe);
router.get("/status/:professionalId", getOnboardingStatus);
router.post("/process-backlog/:professionalId", processBacklogPayments);
router.get("/DashboardLink/:professionalId", getStripeDashboardLink)
export default router;