// import Stripe from "stripe";
// import { Professional } from "../models/Professional.model.js";
// import { asynchandler } from "../utils/Asynchandler.js";
// import { Apiresponse } from "../utils/Apiresponse.js";
// import { Apierror } from "../utils/Apierror.js";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// export const onboardProfessionalToStripe = asynchandler(async (req, res) => {
//   const { professionalId } = req.body;
//   const professional = await Professional.findById(professionalId);
//   if (!professional) throw new Apierror(404, "Professional not found");

//   if (professional.professionalStripeId) {
//     return res.status(200).json(new Apiresponse(200, { stripeAccountId: professional.professionalStripeId }, "Already onboarded"));
//   }

//   const account = await stripe.accounts.create({
//     type: "express",
//     country: "US",
//     email: professional.user.email,
//     capabilities: { transfers: { requested: true } },
//   });

//   professional.professionalStripeId = account.id;
//   await professional.save();

//   const accountLink = await stripe.accountLinks.create({
//     account: account.id,
//     refresh_url: process.env.FRONTEND_URL + "/stripe/refresh",
//     return_url: process.env.FRONTEND_URL + "/stripe/return",
//     type: "account_onboarding",
//   });

//   return res.status(200).json(new Apiresponse(200, { accountLink: accountLink.url }, "Stripe onboarding started"));
// });