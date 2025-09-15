import Stripe from "stripe";
import { Professional } from "../models/Professional.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apierror } from "../utils/Apierror.js";
import { Apiresponse } from "../utils/Apiresponse.js";
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

export const processBacklogPayments = asynchandler(async (req, res) => {
  const { professionalId } = req.params;

  const professional = await Professional.findById(professionalId);
  if (!professional || !professional.professionalStripeId) {
    throw new Apierror(400, "Professional not onboarded to Stripe");
  }

  // Check if the Stripe account is fully enabled for payouts and transfers
  try {
    const account = await stripe.accounts.retrieve(professional.professionalStripeId);
    
    if (!account.payouts_enabled || !account.capabilities?.transfers === 'active') {
      throw new Apierror(400, "Professional's Stripe account is not fully enabled for payouts. Requirements needed: " + 
        (account.requirements?.currently_due?.length > 0 ? account.requirements.currently_due.join(', ') : "None"));
    }
    
  } catch (err) {
    console.error(`Failed to retrieve Stripe account for professional ${professionalId}:`, err);
    throw new Apierror(500, "Failed to verify Stripe account status");
  }

  const pendingPayouts = professional.pendingPayouts || [];
  const processedPayouts = [];
  const failedPayouts = [];

  for (const payout of pendingPayouts.filter((p) => !p.paid)) {
    try {
      await stripe.transfers.create({
        amount: Math.round(payout.amount * 100),
        currency: "usd",
        destination: professional.professionalStripeId,
        metadata: { 
          questionId: payout.questionId.toString(),
          processingDate: new Date().toISOString()
        },
      });

      // Mark as paid
      payout.paid = true;
      payout.timestamp = new Date();
      processedPayouts.push(payout);
    } catch (err) {
      console.error(
        `Failed to process payout for question ${payout.questionId}:`,
        err
      );
      failedPayouts.push({ 
        ...payout.toObject(), 
        error: err.message,
        attemptedAt: new Date() 
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
          accountId: professional.professionalStripeId
        }
      },
      "Backlog payments processed"
    )
  );
});


export const onboardProfessionalToStripe = async (req, res) => {
  try {
    const { professionalId } = req.body;
    const professional = await Professional.findById(professionalId).populate(
      "user"
    );
    if (!professional)
      return res.status(404).json({ message: "Professional not found" });

    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
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

    // if (professional.pendingPayouts && professional.pendingPayouts.length > 0) {
    //   await processBacklogPayments({ params: { professionalId } }, { 
    //     status: () => ({ json: () => {} }) 
    //   });
      
    //   console.log(`Processed ${professional.pendingPayouts.length} pending payouts for professional ${professionalId}`);
    // }

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
