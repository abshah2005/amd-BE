import { Router } from "express";
import { getOnboardingStatus, onboardProfessionalToStripe } from "../Controllers/Onboarding.Controller.js";

const router = Router();

router.post("/stripe", onboardProfessionalToStripe);
router.get("/status/:professionalId", getOnboardingStatus);

export default router;