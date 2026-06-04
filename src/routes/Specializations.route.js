import { Router } from "express";
import {
  createSpecialization,
  getSpecialization,
  updateSpecialization,
  deleteSpecialization,
  getAllSpecializations,
  getTopSpecializations,
  createSpecializationsBulk
} from "../Controllers/Specializations.Controller.js";
import { verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.post("/", createSpecialization);
router.post("/createBulk",createSpecializationsBulk)
router.get("/:id", getSpecialization); // get one
router.put("/:id", updateSpecialization); // update
router.delete("/:id", deleteSpecialization);
router.route("/top").get(getTopSpecializations);
router.get("/", getAllSpecializations); 

export default router;