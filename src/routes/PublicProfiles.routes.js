import { Router } from "express";
import {
  listProfessionals,
  getProfessionalById,
  getTopProfessionals,
  getProfessionalsBySpecialization,
  listAskers,
  getAskerById,
  getProfessionalByFullName,
} from "../Controllers/PublicProfiles.controller.js";
import {verifyJWT} from "../middlewares/Authentication.middleware.js"

const router = Router();

/* Professionals */
router.get("/professionals", verifyJWT,listProfessionals); // ?page&limit&q&tag&category&minPrice&maxPrice&featured&country&sort
router.get("/professionals/top", getTopProfessionals); // ?limit
router.get("/professionals/specialization/:specializationId", getProfessionalsBySpecialization);
router.get("/professionals/:id", getProfessionalById);
router.get("/professionals/name/:fullName", getProfessionalByFullName); // New

/* Askers */
router.get("/askers", listAskers); // ?page&limit&q
router.get("/askers/:id", getAskerById);

export default router;