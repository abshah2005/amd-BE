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
  uploadFile,
  toggleActiveRole,
  registerStep5,
  registerStep4,
  toggleProfessionalStatus,
  linkLinkedInAccount,
} from "../Controllers/User.controller.js";
import { upload } from "../middlewares/Multer.middleware.js";
import { verifyJWT,trackActive, verifyAdmin } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.route("/login").post(Loginuser);
router.route("/logout").post(verifyJWT, trackActive,LogoutUser);
router.route("/getcurrent").get(verifyJWT, trackActive,getCurrentUser);
router.route("/upload").post(upload.single("file"), uploadFile);
router.route("/updateinfo").put(verifyJWT, trackActive,upload.fields([{name:"profilePic",maxCount:1}]),updateInfo);
router.route("/forgotPassword").post(forgotPassword);
router.route("/resetPassword").put(resetPassword);

router.route("/register/step1").post(registerStep1);
router.route("/register/step2").put(registerStep2);
router.route("/register/step3").put(upload.fields([{ name: "profilePic", maxCount: 1 }]), registerStep3);
router.route("/register/step4").put(upload.fields([{ name: "profilePic", maxCount: 1 }]), registerStep4);
router.route("/register/step5").put(registerStep5);

router.route("/auth/linkedin/linkCallback").post(linkLinkedInAccount);

router.route("/update/professional/status").put(verifyJWT, verifyAdmin,toggleProfessionalStatus);

router.route("/role/active").post(verifyJWT,trackActive ,toggleActiveRole);
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


router.route("/auth/linkedin/link").get((req, res) => {
  const state = JSON.stringify({
    userId: req.query.userId, // Pass the userId in the state
    nonce: crypto.randomUUID(),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_LINK_CALLBACK_URL,
    scope: "openid profile email",
    state,
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
});

export default router;