import { Router } from "express";
import {
  createQuestion,
  rejectQuestion,
  payQuestion,
  postAnswer,
  postFollowUp,
  closeThreadAndPayout,
  stripeWebhook,
  listQuestions,
  approveAndQuoteQuestion,
  answerFollowUp,
  submitFeedback,
  getQuestionById,
  approveQuestion,
  paidStatusQuestion
} from "../Controllers/Questions.Controller.js";
import { verifyJWT } from "../middlewares/Authentication.middleware.js";
import { upload } from "../middlewares/Multer.middleware.js";

const router = Router();

router.post("/", verifyJWT,upload.fields([{ name: "attachments", maxCount: 5 }]), createQuestion);
router.post("/:id/approve",verifyJWT,approveQuestion);
router.post("/:id/quote", verifyJWT, approveAndQuoteQuestion);
router.post("/:id/reject", verifyJWT, rejectQuestion);
router.post("/:id/pay", verifyJWT, payQuestion);
router.post("/:id/paid", paidStatusQuestion);

router.post("/stripe/webhook", stripeWebhook);
router.post("/:id/answer", verifyJWT,upload.fields([{ name: "attachments", maxCount: 5 }]) ,postAnswer);
router.post("/:id/followup", verifyJWT, upload.fields([{ name: "attachments", maxCount: 5 }]),postFollowUp);
router.post("/:id/close", verifyJWT, closeThreadAndPayout);
router.get("/", verifyJWT, listQuestions);
router.post("/:id/answer-followup", verifyJWT, upload.fields([{ name: "attachments", maxCount: 5 }]), answerFollowUp);
router.post("/:id/feedback", verifyJWT, submitFeedback);
router.get("/:id",verifyJWT,getQuestionById);

export default router;