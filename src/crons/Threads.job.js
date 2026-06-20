import { Question } from "../models/Question.model.js";
import Stripe from "stripe";
import { executePayout } from "../services/Payout.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "12");

/**
 * Auto-close questions where the professional missed the answerBy deadline.
 * Covers: quoted (professional never responded), awaiting_response (legacy status),
 * and paid (professional accepted payment but never answered within the deadline).
 * Triggers a Stripe refund to the asker for paid questions.
 */
export const autoCloseExpiredQuestions = async () => {
  const now = new Date();
  const expiredQuestions = await Question.find({
    status: { $in: ["quoted", "awaiting_response", "paid"] },
    answerBy: { $lt: now },
  });

  console.log(
    `[autoCloseExpiredQuestions] Found ${expiredQuestions.length} expired question(s) to close.`
  );

  for (const q of expiredQuestions) {
    q.status = "closed";
    q.thread.closedAt = now;
    q.timeline.push({ at: now, status: "auto_closed_due_to_no_answer" });

    if (q.payment.paid && q.payment.paymentReference) {
      try {
        await stripe.refunds.create({
          payment_intent: q.payment.paymentReference,
          reason: "requested_by_customer",
          metadata: { questionId: q._id.toString() },
        });
        q.payment.paid = false;
        q.payment.refunded = true;
      } catch (refundErr) {
        console.error(
          `[autoCloseExpiredQuestions] Stripe refund failed for question ${q._id}:`,
          refundErr
        );
      }
    }

    await q.save();
  }
};

/**
 * Auto-close threads whose 48-hour follow-up window has expired.
 * Covers two cases:
 *   - status "answered": professional answered, asker never posted a follow-up within 48h
 *   - status "in_thread": asker posted a follow-up but professional didn't reply within 48h
 * In both cases the professional is owed their payout at the standard fee rate (no penalty,
 * because the window expired naturally without an early-close action).
 * Triggers executePayout which creates the correct invoice and sends emails.
 */
export const autoCloseExpiredThreads = async () => {
  const now = new Date();
  const expiredThreads = await Question.find({
    status: { $in: ["answered", "in_thread"] },
    "thread.followUpWindowExpiresAt": { $lt: now },
    "payment.paid": true,
    "thread.threadClosedEarlier": false,
  }).populate("professional");

  console.log(
    `[autoCloseExpiredThreads] Found ${expiredThreads.length} expired thread(s) to close.`
  );

  for (const q of expiredThreads) {
    q.status = "closed";
    q.thread.closedAt = now;
    q.timeline.push({ at: now, status: "auto_closed_after_followup_window" });
    await q.save();

    const payoutAmount = Math.round(q.priceUSD * (1 - PLATFORM_FEE_PERCENT / 100));

    try {
      await executePayout(q, payoutAmount, false);
    } catch (err) {
      console.error(
        `[autoCloseExpiredThreads] executePayout failed for question ${q._id}:`,
        err
      );
    }
  }
};