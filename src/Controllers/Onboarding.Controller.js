import Stripe from "stripe";
import { Professional } from "../models/Professional.model.js";
import { Question } from "../models/Question.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apierror } from "../utils/Apierror.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { upgradePendingToSentInvoice } from "../services/Invoice.service.js";
import { SUPPORTED_STRIPE_CURRENCIES, COUNTRY_TO_CURRENCY } from "../constants.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const getOnboardingStatus = async (req, res) => {
  try {
    const { professionalId } = req.params;

    const professional = await Professional.findById(professionalId).populate(
      "user"
    );
    if (!professional)
      return res.status(404).json({ message: "Professional not found" });

    if (!professional.professionalStripeId)
      return res.status(400).json({ message: "Stripe account not linked" });

    const account = await stripe.accounts.retrieve(
      professional.professionalStripeId
    );

    const payoutsEnabled = account.payouts_enabled;
    const requirements = account.requirements;

    return res.status(200).json({
      stripeAccountId: account.id,
      payoutsEnabled,
      requirements: {
        currentlyDue: requirements.currently_due,
        eventuallyDue: requirements.eventually_due,
        pastDue: requirements.past_due,
      },
      message: payoutsEnabled
        ? "Professional can receive payments"
        : "Onboarding incomplete, additional steps required",
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


export const getStripeDashboardLink = async (req, res) => {
  const { professionalId } = req.params;

  const professional = await Professional.findById(professionalId);

  if (!professional?.professionalStripeId) {
    return res.status(400).json({
      message: "Stripe account not connected",
    });
  }

  const loginLink = await stripe.accounts.createLoginLink(
    professional.professionalStripeId
  );

  return res.status(200).json({
    url: loginLink.url,
  });
};

export const processBacklogPayments = asynchandler(async (req, res) => {
  const { professionalId } = req.params;

  const professional = await Professional.findById(professionalId);
  if (!professional || !professional.professionalStripeId) {
    throw new Apierror(400, "Professional not onboarded to Stripe");
  }

  // retrieve stripe account and decide whether to process or leave payouts pending
  let account;
  try {
    account = await stripe.accounts.retrieve(professional.professionalStripeId);
  } catch (err) {
    console.error(
      `Failed to retrieve Stripe account for professional ${professionalId}:`,
      err
    );
    throw new Apierror(500, "Failed to verify Stripe account status");
  }

  const payoutsEnabled = !!account.payouts_enabled;
  const transfersActive = account.capabilities?.transfers === "active";

  // If account is not ready, return status and leave pending payouts as-is
  if (!payoutsEnabled || !transfersActive) {
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          processed: [],
          failed: [],
          pendingCount: (professional.pendingPayouts || []).filter(p => !p.paid).length,
          pendingTotal: (professional.pendingPayouts || [])
            .filter(p => !p.paid)
            .reduce((s, p) => s + (p.amount || 0), 0),
          stripeAccountStatus: {
            ready: false,
            accountId: professional.professionalStripeId,
            requirements: account.requirements || {},
          },
        },
        "Stripe account not ready for payouts — pending payouts retained"
      )
    );
  }

  const accountCurrency = account.default_currency?.toLowerCase();
  if (!accountCurrency || !SUPPORTED_STRIPE_CURRENCIES.has(accountCurrency)) {
    return res.status(400).json(
      new Apiresponse(
        400,
        {
          processed: [],
          failed: [],
          stripeAccountStatus: {
            ready: false,
            accountId: professional.professionalStripeId,
            currency: accountCurrency,
          },
        },
        `Payouts are not supported for the account's settlement currency (${accountCurrency?.toUpperCase() ?? "unknown"}). Please contact support.`
      )
    );
  }

  // Account ready -> attempt to process pending payouts
  const pendingPayouts = professional.pendingPayouts || [];
  const processedPayouts = [];
  const failedPayouts = [];

  for (const payout of pendingPayouts.filter((p) => !p.paid)) {
    const question = await Question.findById(payout.questionId);

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
          questionId: payout.questionId?.toString?.(),
          processingDate: new Date().toISOString(),
          usdAmount: payout.amount.toString(),
          paidCurrency,
        },
      });

      payout.paid = true;
      payout.processedAt = new Date();
      payout.transferId = transfer.id;
      processedPayouts.push(payout);

      // Upgrade the payout_pending invoice to payout_sent (best-effort)
      if (payout.invoiceId) {
        try {
          const question = await Question.findById(payout.questionId)
            .select("title professional payment priceUSD")
            .lean();
          await upgradePendingToSentInvoice(payout.invoiceId, transfer.id, question);
        } catch (invErr) {
          console.error(
            `[processBacklogPayments] Invoice upgrade failed for payout ${payout._id}:`,
            invErr
          );
        }
      }
    } catch (err) {
      console.error(
        `Failed to process payout for question ${payout.questionId}:`,
        err
      );
      // record failure details but keep unpaid so it can be retried later
      failedPayouts.push({
        ...payout.toObject?.() || payout,
        error: err.message,
        attemptedAt: new Date(),
      });
    }
  }

  await professional.save();

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        processed: processedPayouts,
        failed: failedPayouts,
        stripeAccountStatus: {
          ready: true,
          accountId: professional.professionalStripeId,
        },
      },
      "Backlog payments processed (or retained if account not ready)"
    )
  );
});



export const onboardProfessionalToStripe = async (req, res) => {
  try {
    const { professionalId, country = "GB" } = req.body;

    const countryUpper = country.toUpperCase();
    const settlementCurrency = COUNTRY_TO_CURRENCY[countryUpper];
    if (!settlementCurrency) {
      return res.status(400).json({
        message: `Stripe onboarding is not available in your region (${country}). Supported regions settle in: ${[...SUPPORTED_STRIPE_CURRENCIES].map(c => c.toUpperCase()).join(", ")}.`,
      });
    }

    const professional = await Professional.findById(professionalId).populate(
      "user"
    );
    if (!professional)
      return res.status(404).json({ message: "Professional not found" });

    const account = await stripe.accounts.create({
      type: "express",
      country: country,
      email: professional.user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
    });

    professional.professionalStripeId = account.id;
    await professional.save();

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: process.env.FRONTEND_URL + "/account-settings",
      return_url: process.env.FRONTEND_URL + "/account-settings",
      type: "account_onboarding",
    });

    return res.status(200).json({
      accountLink: accountLink.url,
      stripeAccount: account,
      stripeAccountId: account.id,
      message: "Stripe onboarding started",
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
