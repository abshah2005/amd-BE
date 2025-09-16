import { Professional } from "../models/Professional.model.js";
import { Question } from "../models/Question.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const autoCloseExpiredQuestions = async () => {
  const now = new Date();
  const expiredQuestions = await Question.find({
    status: { $in: ["quoted", "awaiting_response"] },
    answerBy: { $lt: now },
  });

  console.log(
    `Found ${expiredQuestions.length} expired questions to close. ${expiredQuestions}`
  );
  for (const q of expiredQuestions) {
    q.status = "closed";
    q.thread.closedAt = now;
    q.timeline.push({ at: now, status: "auto_closed_due_to_no_answer" });

    if (q.payment.paid && q.payment.paymentReference) {
      await stripe.refunds.create({
        payment_intent: q.payment.paymentReference,
        reason: "requested_by_customer",
        metadata: { questionId: q._id.toString() },
      });
      q.payment.paid = false;
      q.payment.refunded = true;
    }
    await q.save();
  }
};

//48 hours after answer
export const autoCloseExpiredThreads = async () => {
  const PLATFORM_FEE_PERCENT = parseFloat(
    process.env.PLATFORM_FEE_PERCENT || "12"
  );
  const now = new Date();
  const expiredThreads = await Question.find({
    status: { $in: ["in_thread"] },
    "thread.followUpWindowExpiresAt": { $lt: now },
    "payment.paid": true,
    "thread.threadClosedEarlier": false,
  }).populate("professional");

  console.log(
    `Found ${expiredThreads.length} expired threads to close. ${expiredThreads}`
  );

  for (const q of expiredThreads) {
    q.status = "closed";
    q.thread.closedAt = now;
    q.timeline.push({ at: now, status: "auto_closed_after_followup_window" });
    await q.save();

    const payoutAmount = Math.round(
      q.priceUSD * (1 - PLATFORM_FEE_PERCENT / 100)
    );
     
    if (q.professional?.professionalStripeId) {
      try {
        const account = await stripe.accounts.retrieve(
          q.professional.professionalStripeId
        );

        const payoutsEnabled = !!account.payouts_enabled;
        const transfersActive = account.capabilities?.transfers === "active";

        if (payoutsEnabled && transfersActive) {
          try {
            await stripe.transfers.create({
              amount: Math.round(payoutAmount * 100),
              currency: "usd",
              destination: q.professional.professionalStripeId,
              metadata: { questionId: q._id.toString() },
            });
            console.log(
              `Auto payout of $${payoutAmount} to professional ${q.professional._id}`
            );
          } catch (txErr) {
            console.error(
              `Auto payout transfer failed for question ${q._id}, saving to pendingPayouts:`,
              txErr
            );
            await Professional.findByIdAndUpdate(q.professional._id, {
              $push: {
                pendingPayouts: {
                  amount: payoutAmount,
                  questionId: q._id,
                  timestamp: new Date(),
                  paid: false,
                },
              },
            });
          }
        } else {
          console.log(
            `Stripe account ${q.professional.professionalStripeId} not ready for payouts. Saving pending payout.`
          );
          await Professional.findByIdAndUpdate(q.professional._id, {
            $push: {
              pendingPayouts: {
                amount: payoutAmount,
                questionId: q._id,
                timestamp: new Date(),
                paid: false,
              },
            },
          });
        }
      } catch (accErr) {
        console.error(
          `Failed to retrieve Stripe account for professional ${q.professional._id}. Saving pending payout.`,
          accErr
        );
        await Professional.findByIdAndUpdate(q.professional._id, {
          $push: {
            pendingPayouts: {
              amount: payoutAmount,
              questionId: q._id,
              timestamp: new Date(),
              paid: false,
            },
          },
        });
      }
    } else {
      // no stripe account -> add to pending
      await Professional.findByIdAndUpdate(q.professional._id, {
        $push: {
          pendingPayouts: {
            amount: payoutAmount,
            questionId: q._id,
            timestamp: new Date(),
            paid: false,
          },
        },
      });
    }
  }
};
