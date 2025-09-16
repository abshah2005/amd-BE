import { Router } from "express";
import { requestProfileDeletion,canCreateProfessionalAccount,cancelProfileDeletion } from "../Controllers/AccountDeletionController.js";
import { verifyAdmin, verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();
router.route("/delete-account").delete(verifyJWT, requestProfileDeletion);
router.route("/cancel-deletion").post(verifyJWT, cancelProfileDeletion);
router.route("/can-create-professional").get(verifyJWT, canCreateProfessionalAccount);

export default router;