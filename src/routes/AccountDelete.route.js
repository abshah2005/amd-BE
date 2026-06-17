import { Router } from "express";
import { requestProfileDeletion,canCreateProfessionalAccount,cancelProfileDeletion,requestProfileDeletionAdmin, cancelProfileDeletionAdmin } from "../Controllers/AccountDeletionController.js";
import { verifyAdmin, verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();
router.route("/remove-account-admin").delete(verifyJWT,verifyAdmin,requestProfileDeletionAdmin)
router.route("/delete-account").delete(verifyJWT, requestProfileDeletion);
router.route("/cancel-deletion").post(verifyJWT, cancelProfileDeletion);
router.route("/can-create-professional").get(verifyJWT, canCreateProfessionalAccount);
router.route("/cancel-deletion-admin").delete(verifyJWT,verifyAdmin,cancelProfileDeletionAdmin);
export default router;