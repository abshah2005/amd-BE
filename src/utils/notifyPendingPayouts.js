import { Users } from "../models/Users.model";
import { sendEmail } from "./Nodemailer";

export const notifyPendingPayout = async (professional) => {
  const user = await Users.findById(professional.user);
  if (!user?.email) return;
  
  const subject = "Action Required: Complete Stripe Onboarding to Receive Payments";
  const message = `
    <h2>You Have Pending Payments</h2>
    <p>You've successfully answered questions and have payments waiting for you!</p>
    <p>To receive your funds, please complete your Stripe onboarding process.</p>
    <p><a href="${process.env.FRONTEND_URL}/account/payments/setup">Complete Stripe Setup</a></p>
  `;
  
  return sendEmail(user.email, subject, message);
};