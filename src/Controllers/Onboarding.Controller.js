import Stripe from "stripe";
import { Professional } from "../models/Professional.model.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
      capabilities: { card_payments: { requested: true },transfers: { requested: true } },
      business_type: "individual",
    });

    professional.professionalStripeId = account.id;
    await professional.save();

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: process.env.FRONTEND_URL + "/stripe/refresh",
      return_url: process.env.FRONTEND_URL + "/stripe/return",
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
