import { Router } from "express";
import crypto from "crypto"
import {
  Loginuser,
  getCurrentUser,
  LogoutUser,
  updateInfo,
  forgotPassword,
  resetPassword,
  registerStep1,
  registerStep2,
  registerStep3,
  getRegistrationState,
  linkedinCallback,
  getLinkedInProfile,
} from "../Controllers/User.controller.js";
import { upload } from "../middlewares/Multer.middleware.js";
import { verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.route("/login").post(Loginuser);
router.route("/logout").post(verifyJWT, LogoutUser);
router.route("/getcurrent").get(verifyJWT, getCurrentUser);
router.route("/updateinfo").put(verifyJWT, updateInfo);
router.route("/forgotPassword").post(forgotPassword);
router.route("/resetPassword").put(resetPassword);

router.route("/register/step1").post(registerStep1);
router.route("/register/step2").put(registerStep2);
router.route("/register/step3").put(upload.fields([{ name: "profilePic", maxCount: 1 }]), registerStep3);

router.route("/register/state").get(getRegistrationState);

router.route("/auth/linkedin/callback").post(linkedinCallback);
router.route("/profile/linkedin").get(getLinkedInProfile);

router.route("/auth/linkedin").get((req, res) => {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
    scope: "openid profile email",
    state:state
  });
  
  
  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
});

export default router;