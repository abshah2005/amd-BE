import Stripe from "stripe";
import { Professional } from "../../models/Professional.model.js";
import { Question } from "../../models/Question.model.js";
import {
  createPayoutSentInvoice,
  createPayoutPendingInvoice,
} from "../../services/Invoice.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const processPendingPayouts = async () => {
  const professionals = await Professional.find({
    professionalStripeId: { $exists: true, $ne: null },
    pendingPayouts: { $elemMatch: { paid: false } },
  });

  console.log(
    `[process_pending_payouts] Found ${professionals.length} professional(s) with pending payouts.`
  );

  for (const professional of professionals) {
    // Verify the Stripe account is ready before attempting any transfers
    let account;
    try {
      account = await stripe.accounts.retrieve(professional.professionalStripeId);
    } catch (err) {
      console.error(
        `[process_pending_payouts] Could not retrieve Stripe account for professional ${professional._id}:`,
        err
      );
      continue;
    }

    if (!account.payouts_enabled) {
      console.log(
        `[process_pending_payouts] Professional ${professional._id} Stripe account not yet ready for payouts. Skipping.`
      );
      continue;
    }

    const pendingPayouts = professional.pendingPayouts.filter((p) => !p.paid);
    console.log(
      `[process_pending_payouts] Processing ${pendingPayouts.length} pending payout(s) for professional ${professional._id}.`
    );

    for (const payout of pendingPayouts) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(payout.amount * 100),
          currency: "usd",
          destination: professional.professionalStripeId,
          metadata: {
            questionId: payout.questionId.toString(),
            processedAt: new Date().toISOString(),
          },
        });

        // Mark payout as paid and record transfer details (all fields now in schema)
        payout.paid = true;
        payout.processedAt = new Date();
        payout.transferId = transfer.id;

        // Create payout-sent invoice (best-effort — don't let failure block the payout mark)
        // Only create if there isn't already a sent invoice on this payout
        if (!payout.invoiceId) {
          try {
            const question = await Question.findById(payout.questionId).populate("professional");
            if (question) {
              const earlyClose = !!(
                question.thread && question.thread.threadClosedEarlier
              );
              const invoice = await createPayoutSentInvoice(
                question,
                payout.amount,
                transfer.id,
                earlyClose
              );
              if (invoice?._id) {
                payout.invoiceId = invoice._id;
                try {
                  question.payoutInvoiceId = invoice._id;
                  await question.save();
                } catch (qErr) {
                  console.error(
                    `[process_pending_payouts] Failed to link payout invoice on question ${question._id}:`,
                    qErr
                  );
                }
              }
            } else {
              console.log(
                `[process_pending_payouts] Question ${payout.questionId} not found; skipping invoice creation.`
              );
            }
          } catch (invErr) {
            console.error(
              `[process_pending_payouts] createPayoutSentInvoice failed for question ${payout.questionId}:`,
              invErr
            );
          }
        }
      } catch (txErr) {
        console.error(
          `[process_pending_payouts] Transfer failed for question ${payout.questionId}:`,
          txErr
        );

        // Only create a pending invoice if one was never created (avoids duplicates on retries)
        if (!payout.invoiceId) {
          try {
            const question = await Question.findById(payout.questionId).populate("professional");
            if (question) {
              const earlyClose = !!(
                question.thread && question.thread.threadClosedEarlier
              );
              const pendingInvoice = await createPayoutPendingInvoice(
                question,
                payout.amount,
                earlyClose
              );
              if (pendingInvoice?._id) {
                payout.invoiceId = pendingInvoice._id;
              }
            } else {
              console.log(
                `[process_pending_payouts] Question ${payout.questionId} not found; skipping pending invoice.`
              );
            }
          } catch (invErr) {
            console.error(
              `[process_pending_payouts] createPayoutPendingInvoice failed for question ${payout.questionId}:`,
              invErr
            );
          }
        }
        // payout.paid remains false — will be retried on next job run
      }
    }

    await professional.save();
  }
};