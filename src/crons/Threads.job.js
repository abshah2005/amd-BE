import { Question } from "../models/Question.model.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const autoCloseExpiredQuestions = asynchandler(async () => {
  const now = new Date();
  const expiredQuestions = await Question.find({
    status: { $in: ["quoted", "awaiting_response"] },
    answerBy: { $lte: now }
  });

  for (const q of expiredQuestions) {
    q.status = "closed";
    q.thread.closedAt = now;
    q.timeline.push({ at: now, status: "auto_closed_due_to_no_answer" });
    await q.save();
  }
});

export const autoCloseExpiredThreads = async () => {
  const now = new Date();
  const expiredThreads = await Question.find({
    status: { $nin: ["closed", "cancelled", "rejected"] },
    "thread.followUpWindowExpiresAt": { $lt: now },
    "payment.paid": true,
  }).populate("professional");

  for (const q of expiredThreads) {
    q.status = "closed";
    q.thread.closedAt = now;
    await q.save();

    if (q.professional.professionalStripeId) {
      await stripe.transfers.create({
        amount: Math.round(q.price * 100),
        currency: "usd",
        destination: q.professional.professionalStripeId,
        metadata: { questionId: q._id.toString() },
      });
    }
    // Optionally send notification to both parties
  }
};
