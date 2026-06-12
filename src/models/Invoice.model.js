import mongoose, { Schema } from "mongoose";

/**
 * Invoice types:
 *  - payment_received  : Asker paid for a question  (Asker is billed party)
 *  - payout_sent       : Platform transferred money to Professional via Stripe
 *  - payout_pending    : Payout could not be sent immediately; stored as pendingPayout
 */

const InvoiceSchema = new Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["payment_received", "payout_sent", "payout_pending"],
      required: true,
      index: true,
    },

    // The question this invoice is linked to
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },

    // Who was billed / received the money
    issuedTo: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
      name: { type: String },
      email: { type: String },
      role: { type: String, enum: ["asker", "professional"] },
    },

    // Platform is always the issuer
    issuedBy: {
      name: { type: String, default: "Platform" },
    },

    // Financial details
    amounts: {
      subtotal: { type: Number, required: true },          // quote amount (USD)
      platformFeePercent: { type: Number, default: 0 },   // e.g. 12
      platformFeeAmount: { type: Number, default: 0 },    // derived
      penaltyPercent: { type: Number, default: 0 },       // early close penalty
      penaltyAmount: { type: Number, default: 0 },
      total: { type: Number, required: true },            // what actually moved
      currency: { type: String, default: "usd" },
    },

    // Stripe references for traceability
    stripePaymentIntentId: { type: String, default: null },
    stripeTransferId: { type: String, default: null },

    // The public-facing slug used in invoice URL
    publicToken: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // A simple status — invoices are immutable records, but we track state
    status: {
      type: String,
      enum: ["issued", "void"],
      default: "issued",
    },

    notes: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Generate invoice number:  INV-{year}-{padded sequence}
// We use a separate auto-increment approach via a counter embedded in the number itself
InvoiceSchema.pre("validate", async function (next) {
  if (this.isNew && !this.invoiceNumber) {
    try {
      const year = new Date().getFullYear();
      const count = await mongoose.model("Invoice").countDocuments({
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });
      this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(5, "0")}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

export const Invoice = mongoose.model("Invoice", InvoiceSchema);