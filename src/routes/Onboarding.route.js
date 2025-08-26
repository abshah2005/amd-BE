import { Router } from "express";
import { onboardProfessionalToStripe } from "../Controllers/Onboarding.Controller.js";

const router = Router();

router.post("/stripe", onboardProfessionalToStripe);

export default router;