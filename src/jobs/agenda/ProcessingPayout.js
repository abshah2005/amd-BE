import agenda from "./AgendaInstance.js";
import Stripe from "stripe";
import { Professional } from "../../models/Professional.model.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

agenda.define("process_pending_payouts", async (job) => {
  const professionals = await Professional.find({
    professionalStripeId: { $exists: true, $ne: null },
    pendingPayouts: { $elemMatch: { paid: false } }
  });
  
  console.log(`Found ${professionals.length} professionals with pending payouts to process`);
  
  for (const professional of professionals) {
    // Check account status before attempting transfers
    try {
      const account = await stripe.accounts.retrieve(professional.professionalStripeId);
      
      if (!account.payouts_enabled) {
        console.log(`Professional ${professional._id} has pending payouts but Stripe account is not ready for payouts`);
        continue; // Skip this professional and check again later
      }
      
      const pendingPayouts = professional.pendingPayouts.filter(p => !p.paid);
      console.log(`Processing ${pendingPayouts.length} pending payouts for ${professional._id}`);
      
      for (const payout of pendingPayouts) {
        try {
          await stripe.transfers.create({
            amount: Math.round(payout.amount * 100),
            currency: "usd",
            destination: professional.professionalStripeId,
            metadata: { 
              questionId: payout.questionId.toString(),
              processedAt: new Date().toISOString()
            }
          });
          
          // Mark as paid
          payout.paid = true;
          payout.timestamp = new Date();
        } catch (err) {
          console.error(`Failed to process payout for question ${payout.questionId}:`, err);
          
        }
      }
      
      await professional.save();
      
    } catch (err) {
      console.error(`Error checking Stripe account for professional ${professional._id}:`, err);
    }
  }
});