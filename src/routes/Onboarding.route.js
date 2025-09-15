import { Router } from "express";
import { getOnboardingStatus, onboardProfessionalToStripe, processBacklogPayments } from "../Controllers/Onboarding.Controller.js";

const router = Router();

router.post("/stripe", onboardProfessionalToStripe);
router.get("/status/:professionalId", getOnboardingStatus);
router.post("/process-backlog/:professionalId", processBacklogPayments);
export default router;