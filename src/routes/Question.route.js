import { Router } from "express";
import {
  createQuestion,
  approveQuestion,
  rejectQuestion,
  postQuote,
  payQuestion,
  postAnswer,
  postFollowUp,
  closeThreadAndPayout,
  stripeWebhook,
  listQuestions
} from "../Controllers/Questions.Controller.js";
import { verifyJWT } from "../middlewares/Authentication.middleware.js";

const router = Router();

router.post("/", verifyJWT, createQuestion);
router.post("/:id/approve", verifyJWT, approveQuestion);
router.post("/:id/reject", verifyJWT, rejectQuestion);
router.post("/:id/quote", verifyJWT, postQuote);
router.post("/:id/pay", verifyJWT, payQuestion);
router.post("/stripe/webhook", stripeWebhook);
router.post("/:id/answer", verifyJWT, postAnswer);
router.post("/:id/followup", verifyJWT, postFollowUp);
router.post("/:id/close", verifyJWT, closeThreadAndPayout);
router.get("/", verifyJWT, listQuestions);

export default router;