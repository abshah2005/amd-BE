import Stripe from "stripe";
import { Professional } from "../models/Professional.model.js";
import {
  createPayoutSentInvoice,
  createPayoutPendingInvoice,
} from "./Invoice.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Attempt a Stripe transfer to the professional.
 * On any failure (account not ready, transfer error, no Stripe ID), fall back to
 * storing a pendingPayout entry and creating a payout_pending invoice.
 * Handles invoice creation and email for both success and failure paths.
 *
 * @param {Object}  question      - Mongoose Question doc with `professional` populated
 * @param {number}  payoutAmount  - Net USD amount after platform fees
 * @param {boolean} earlyClose    - Whether the early-close penalty was applied
 * @returns {Promise<{ success: boolean, transferId?: string }>}
 */
export async function executePayout(question, payoutAmount, earlyClose = false) {
  const professional = question.professional;

  // Stores a pending payout entry and a payout_pending invoice (best-effort).
  // Pass an existingInvoiceId to skip creating a new invoice (avoids duplicates on retries).
  async function storePending(existingInvoiceId = null) {
    let invoiceId = existingInvoiceId;

    if (!invoiceId) {
      try {
        const inv = await createPayoutPendingInvoice(question, payoutAmount, earlyClose);
        invoiceId = inv?._id || null;
      } catch (invErr) {
        console.error(
          `[Payout] createPayoutPendingInvoice failed for question ${question._id}:`,
          invErr
        );
      }
    }

    try {
      await Professional.findByIdAndUpdate(professional._id, {
        $push: {
          pendingPayouts: {
            amount: payoutAmount,
            questionId: question._id,
            timestamp: new Date(),
            paid: false,
            ...(invoiceId && { invoiceId }),
          },
        },
      });
    } catch (dbErr) {
      console.error(
        `[Payout] Failed to store pendingPayout for professional ${professional._id}:`,
        dbErr
      );
    }

    return { success: false };
  }

  // No Stripe account on file — park in pendingPayouts immediately
  if (!professional?.professionalStripeId) {
    console.log(
      `[Payout] Professional ${professional._id} has no Stripe account. Storing pending payout for question ${question._id}.`
    );
    return storePending();
  }

  // Verify the Stripe account is ready
  let account;
  try {
    account = await stripe.accounts.retrieve(professional.professionalStripeId);
  } catch (accErr) {
    console.error(
      `[Payout] Could not retrieve Stripe account for professional ${professional._id}:`,
      accErr
    );
    return storePending();
  }

  const payoutsEnabled = !!account.payouts_enabled;
  const transfersActive = account.capabilities?.transfers === "active";

  if (!payoutsEnabled || !transfersActive) {
    console.log(
      `[Payout] Stripe account ${professional.professionalStripeId} not ready ` +
        `(payoutsEnabled=${payoutsEnabled}, transfersActive=${transfersActive}). ` +
        `Storing pending payout for question ${question._id}.`
    );
    return storePending();
  }

  // Attempt the transfer
  try {
    // Transfer in the same currency the client paid in. Stripe holds each payment
    // currency in a separate balance bucket — the transfer must debit from the bucket
    // that actually has funds. Stripe then auto-converts to the connected account's
    // settlement currency if they differ.
    const paidCurrency = question.payment?.paidCurrency?.toLowerCase() || "usd";
    const grossPaid = question.payment?.paidAmount || payoutAmount;
    const grossUSD = question.payment?.amountUSD || question.priceUSD || payoutAmount;
    const feeRatio = grossUSD > 0 ? payoutAmount / grossUSD : 1;
    const stripeAmount = Math.round(grossPaid * feeRatio * 100);

    const transfer = await stripe.transfers.create({
      amount: stripeAmount,
      currency: paidCurrency,
      destination: professional.professionalStripeId,
      metadata: {
        questionId: question._id.toString(),
        processedAt: new Date().toISOString(),
        usdAmount: payoutAmount.toString(),
        paidCurrency,
      },
    });

    console.log(
      `[Payout] Transfer ${transfer.id} of ${(stripeAmount / 100).toFixed(2)} ${paidCurrency.toUpperCase()} ` +
        `(~$${payoutAmount} USD net) to professional ${professional._id} for question ${question._id}`
    );

    // Best-effort invoice + question update
    try {
      const invoice = await createPayoutSentInvoice(
        question,
        payoutAmount,
        transfer.id,
        earlyClose
      );
      if (invoice?._id) {
        question.payoutInvoiceId = invoice._id;
        await question.save();
      }
    } catch (invErr) {
      console.error(
        `[Payout] createPayoutSentInvoice failed for question ${question._id}:`,
        invErr
      );
    }

    return { success: true, transferId: transfer.id };
  } catch (txErr) {
    console.error(
      `[Payout] Stripe transfer failed for question ${question._id}. Falling back to pending payout:`,
      txErr
    );
    return storePending();
  }
}