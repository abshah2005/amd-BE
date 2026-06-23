import Stripe from "stripe";
import { Professional } from "../../models/Professional.model.js";
import { Question } from "../../models/Question.model.js";
import {
  createPayoutSentInvoice,
  createPayoutPendingInvoice,
  upgradePendingToSentInvoice,
} from "../../services/Invoice.service.js";
import { SUPPORTED_STRIPE_CURRENCIES } from "../../constants.js";

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

    const accountCurrency = account.default_currency?.toLowerCase();
    if (!accountCurrency || !SUPPORTED_STRIPE_CURRENCIES.has(accountCurrency)) {
      console.log(
        `[process_pending_payouts] Professional ${professional._id} has unsupported settlement currency (${accountCurrency?.toUpperCase() ?? "unknown"}). Skipping.`
      );
      continue;
    }

    const pendingPayouts = professional.pendingPayouts.filter((p) => !p.paid);
    console.log(
      `[process_pending_payouts] Processing ${pendingPayouts.length} pending payout(s) for professional ${professional._id}.`
    );

    for (const payout of pendingPayouts) {
      // Load question before the transfer — needed for paidCurrency and invoice creation
      const question = await Question.findById(payout.questionId).populate("professional");

      try {
        // Transfer in the same currency the client paid in. Stripe holds each payment
        // currency in a separate balance bucket — the transfer must debit from the bucket
        // that actually has funds. Stripe then auto-converts to the connected account's
        // settlement currency if they differ.
        const paidCurrency = question?.payment?.paidCurrency?.toLowerCase() || "usd";
        const grossPaid = question?.payment?.paidAmount || payout.amount;
        const grossUSD = question?.payment?.amountUSD || question?.priceUSD || payout.amount;
        const feeRatio = grossUSD > 0 ? payout.amount / grossUSD : 1;
        const stripeAmount = Math.round(grossPaid * feeRatio * 100);

        const transfer = await stripe.transfers.create({
          amount: stripeAmount,
          currency: paidCurrency,
          destination: professional.professionalStripeId,
          metadata: {
            questionId: payout.questionId.toString(),
            processedAt: new Date().toISOString(),
            usdAmount: payout.amount.toString(),
            paidCurrency,
          },
        });

        // Mark payout as paid and record transfer details
        payout.paid = true;
        payout.processedAt = new Date();
        payout.transferId = transfer.id;

        // Create / upgrade payout-sent invoice (best-effort — don't block the payout mark)
        try {
          if (question) {
            const earlyClose = !!(question.thread && question.thread.threadClosedEarlier);
            let invoiceId = null;

            if (payout.invoiceId) {
              // A payout_pending invoice exists from a prior failed attempt — upgrade it
              const upgraded = await upgradePendingToSentInvoice(payout.invoiceId, transfer.id, question);
              invoiceId = upgraded?._id || payout.invoiceId;
            } else {
              const invoice = await createPayoutSentInvoice(
                question,
                payout.amount,
                transfer.id,
                earlyClose
              );
              invoiceId = invoice?._id || null;
            }

            if (invoiceId) {
              payout.invoiceId = invoiceId;
              try {
                question.payoutInvoiceId = invoiceId;
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
            `[process_pending_payouts] Invoice update failed for question ${payout.questionId}:`,
            invErr
          );
        }
      } catch (txErr) {
        console.error(
          `[process_pending_payouts] Transfer failed for question ${payout.questionId}:`,
          txErr
        );

        // Only create a pending invoice if one was never created (avoids duplicates on retries)
        if (!payout.invoiceId) {
          try {
            if (question) {
              const earlyClose = !!(question.thread && question.thread.threadClosedEarlier);
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
