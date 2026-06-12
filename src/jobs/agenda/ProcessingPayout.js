import agenda from "./AgendaInstance.js";
import Stripe from "stripe";
import { Professional } from "../../models/Professional.model.js";
import Question from "../../models/Question.model.js";
import {
  createPayoutSentInvoice,
  createPayoutPendingInvoice,
} from "../../services/Invoice.service.js";

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
          // load question for invoice context
          const question = await Question.findById(payout.questionId).populate("professional");
          const earlyClose = !!(question && question.thread && question.thread.threadClosedEarlier);

          const transfer = await stripe.transfers.create({
            amount: Math.round(payout.amount * 100),
            currency: "usd",
            destination: professional.professionalStripeId,
            metadata: { 
              questionId: payout.questionId.toString(),
              processedAt: new Date().toISOString()
            }
          });

          // Mark as paid and record transfer info
          payout.paid = true;
          payout.processedAt = new Date();
          payout.transferId = transfer.id;

          // Create payout-sent invoice (best-effort)
          try {
            if (question) {
              const invoice = await createPayoutSentInvoice(question, payout.amount, transfer.id, earlyClose);
              if (invoice && invoice._id) {
                payout.invoiceId = invoice._id;
                // also link invoice on question if desired
                try {
                  question.payoutInvoiceId = invoice._id;
                  await question.save();
                } catch (qErr) {
                  console.error(`Failed to attach payout invoice to question ${question._id}:`, qErr);
                }
              }
            } else {
              console.log(`Question ${payout.questionId} not found; skipping invoice creation`);
            }
          } catch (invErr) {
            console.error(`Failed to create payout-sent invoice for question ${payout.questionId}:`, invErr);
          }

        } catch (err) {
          console.error(`Failed to process payout for question ${payout.questionId}:`, err);

          // On transfer failure, create a pending payout invoice if possible
          try {
            const question = await Question.findById(payout.questionId).populate("professional");
            const earlyClose = !!(question && question.thread && question.thread.threadClosedEarlier);
            if (question) {
              const pendingInvoice = await createPayoutPendingInvoice(question, payout.amount, earlyClose);
              if (pendingInvoice && pendingInvoice._id) {
                payout.invoiceId = pendingInvoice._id;
              }
            } else {
              console.log(`Question ${payout.questionId} not found; could not create pending invoice`);
            }
          } catch (invErr) {
            console.error(`Failed to create pending payout invoice for question ${payout.questionId}:`, invErr);
          }

          // keep payout.paid = false so it remains pending
        }
      }
      
      await professional.save();
      
    } catch (err) {
      console.error(`Error checking Stripe account for professional ${professional._id}:`, err);
    }
  }
});