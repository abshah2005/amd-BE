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
  paidStatusQuestion,
  deleteQuestion,
  getPaymentOptions,
  listQuestionsByUserType
} from "../Controllers/Questions.Controller.js";
import { verifyJWT,trackActive } from "../middlewares/Authentication.middleware.js";
import { upload } from "../middlewares/Multer.middleware.js";

const router = Router();

router.post("/", verifyJWT,trackActive,upload.fields([{ name: "attachments", maxCount: 5 }]), createQuestion);
router.post("/:id/approve",verifyJWT,trackActive,approveQuestion);
router.post("/:id/quote", verifyJWT, trackActive,approveAndQuoteQuestion);
router.post("/:id/reject", verifyJWT, trackActive,rejectQuestion);
router.post("/:id/pay", verifyJWT, trackActive,payQuestion);
router.post("/:id/payment-options",verifyJWT,getPaymentOptions );
router.post("/:id/paid", paidStatusQuestion);

router.post("/stripe/webhook", stripeWebhook);
router.post("/:id/answer", verifyJWT,trackActive,upload.fields([{ name: "attachments", maxCount: 5 }]) ,postAnswer);
router.post("/:id/followup", verifyJWT, trackActive,upload.fields([{ name: "attachments", maxCount: 5 }]),postFollowUp);
router.post("/:id/close", verifyJWT, trackActive,closeThreadAndPayout);
router.get("/", verifyJWT, trackActive,listQuestions);
router.get("/getQuestions",listQuestionsByUserType);
router.post("/:id/answer-followup", verifyJWT, trackActive,upload.fields([{ name: "attachments", maxCount: 5 }]), answerFollowUp);
router.post("/:id/feedback", verifyJWT, trackActive,submitFeedback);
router.get("/:id",verifyJWT,trackActive,getQuestionById);
router.delete("/:id", verifyJWT, trackActive,deleteQuestion)

export default router;