import crypto from "crypto";
import { Invoice } from "../models/Invoice.model.js";
import { Users } from "../models/Users.model.js";
import { Professional } from "../models/Professional.model.js";
import { paymentReceivedTemplate, payoutPendingTemplate, payoutSentTemplate, sendInvoiceEmail } from "../utils/Nodemailer.js";

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || "12");
const EARLY_CLOSE_PENALTY_PERCENT = parseFloat(process.env.EARLY_CLOSE_PENALTY_PERCENT || "3");

/**
 * Generate a short unique public token for the invoice URL.
 */
function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Resolve asker User document from a question.
 * question.asker may be an ObjectId or a populated User object.
 */
async function resolveAskerUser(question) {
  if (question.asker && question.asker.email) {
    return question.asker; // already populated
  }
  return await Users.findById(question.asker).select("firstName lastName email").lean();
}

/**
 * Resolve Professional + their User document from a question.
 * question.professional may be ObjectId or populated Professional doc.
 */
async function resolveProfessionalUser(question) {
  let pro = question.professional;
  if (!pro || !pro._id) {
    pro = await Professional.findById(question.professional).lean();
  }
  if (!pro) return { pro: null, user: null };

  let user = null;
  if (pro.user && pro.user.email) {
    user = pro.user;
  } else {
    user = await Users.findById(pro.user).select("firstName lastName email").lean();
  }
  return { pro, user };
}

// ---------------------------------------------------------------------------
// 1. Called when Asker's payment is confirmed (stripeWebhook / paidStatusQuestion)
// ---------------------------------------------------------------------------
/**
 * @param {Object} question  - Mongoose Question document (payment fields already set)
 * @returns {Promise<Invoice>}
 */
export async function createPaymentReceivedInvoice(question) {
  try {
    const asker = await resolveAskerUser(question);

    const subtotal = question.payment?.amountUSD || question.priceUSD || 0;

    const invoice = await Invoice.create({
      publicToken: generatePublicToken(),
      type: "payment_received",
      question: question._id,
      issuedTo: {
        userId: question.asker?._id || question.asker,
        name: asker ? `${asker.firstName || ""} ${asker.lastName || ""}`.trim() : "Unknown",
        email: asker?.email || null,
        role: "asker",
      },
      amounts: {
        subtotal,
        platformFeePercent: 0,
        platformFeeAmount: 0,
        penaltyPercent: 0,
        penaltyAmount: 0,
        total: subtotal,
        currency: question.payment?.paidCurrency || "usd",
      },
      stripePaymentIntentId: question.payment?.paymentReference || null,
      notes: `Payment for question: "${question.title}"`,
    });

    // Store invoice reference back on the question's payment subdoc (caller must save)
    question.payment.invoiceId = invoice._id;
    question.payment.invoiceUrl = buildPublicInvoiceUrl(invoice.publicToken);

    // non-blocking email to asker with invoice link
    try {
      const html = paymentReceivedTemplate({
        logoUrl: process.env.APP_LOGO_URL,
        askerName: asker ? `${asker.firstName || ""} ${asker.lastName || ""}`.trim() : "Customer",
        invoiceNumber: String(invoice._id).slice(-8),
        invoiceDate: invoice.createdAt ? invoice.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
        questionTitle: question.title,
        subtotalUSD: subtotal,
        invoiceUrl: buildPublicInvoiceUrl(invoice.publicToken),
        supportEmail: process.env.SUPPORT_EMAIL,
      });
      const subject = `AskMeDirect — Payment received (${formatUSD(subtotal)})`;
      sendInvoiceEmail(asker?.email || process.env.SUPPORT_EMAIL, subject, html);
    } catch (mailErr) {
      console.error("[InvoiceService] payment email preparation failed:", mailErr);
    }

    return invoice;
  } catch (err) {
    console.error("[InvoiceService] createPaymentReceivedInvoice failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Called when platform successfully transfers money to professional via Stripe
// ---------------------------------------------------------------------------
/**
 * @param {Object} question       - Mongoose Question document
 * @param {number} payoutAmount   - Net amount sent to professional (after fees)
 * @param {string} stripeTransferId
 * @param {boolean} earlyClose    - Whether early-close penalty was applied
 * @returns {Promise<Invoice>}
 */
export async function createPayoutSentInvoice(question, payoutAmount, stripeTransferId, earlyClose = false) {
  try {
    const { pro, user } = await resolveProfessionalUser(question);

    const subtotal = question.priceUSD || 0;
    const totalFeePercent = PLATFORM_FEE_PERCENT + (earlyClose ? EARLY_CLOSE_PENALTY_PERCENT : 0);
    const platformFeeAmount = Math.round(subtotal * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const penaltyAmount = earlyClose
      ? Math.round(subtotal * (EARLY_CLOSE_PENALTY_PERCENT / 100) * 100) / 100
      : 0;

    const invoice = await Invoice.create({
      publicToken: generatePublicToken(),
      type: "payout_sent",
      question: question._id,
      issuedTo: {
        userId: pro?.user?._id || pro?.user,
        name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Professional",
        email: user?.email || null,
        role: "professional",
      },
      amounts: {
        subtotal,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        platformFeeAmount,
        penaltyPercent: earlyClose ? EARLY_CLOSE_PENALTY_PERCENT : 0,
        penaltyAmount,
        total: payoutAmount,
        currency: "usd",
      },
      stripePaymentIntentId: question.payment?.paymentReference || null,
      stripeTransferId: stripeTransferId || null,
      notes: earlyClose
        ? `Payout for question: "${question.title}" — early close penalty applied.`
        : `Payout for question: "${question.title}"`,
    });

    // Send non-blocking email to professional
    try {
      const html = payoutSentTemplate({
        logoUrl: process.env.APP_LOGO_URL,
        proName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Professional",
        invoiceNumber: String(invoice._id).slice(-8),
        invoiceDate: invoice.createdAt ? invoice.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
        questionTitle: question.title,
        payoutAmountUSD: payoutAmount,
        transferId: stripeTransferId,
        invoiceUrl: buildPublicInvoiceUrl(invoice.publicToken),
        supportEmail: process.env.SUPPORT_EMAIL,
      });
      const subject = `AskMeDirect — Payout processed (${formatUSD(payoutAmount)})`;
      sendInvoiceEmail(user?.email || process.env.SUPPORT_EMAIL, subject, html);
    } catch (mailErr) {
      console.error("[InvoiceService] payout sent email prep failed:", mailErr);
    }

    return invoice;
  } catch (err) {
    console.error("[InvoiceService] createPayoutSentInvoice failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Called when payout cannot be sent and is stored as pendingPayout
// ---------------------------------------------------------------------------
/**
 * @param {Object} question     - Mongoose Question document
 * @param {number} payoutAmount - Amount that will be paid later
 * @param {boolean} earlyClose
 * @returns {Promise<Invoice>}
 */
export async function createPayoutPendingInvoice(question, payoutAmount, earlyClose = false) {
  try {
    const { pro, user } = await resolveProfessionalUser(question);

    const subtotal = question.priceUSD || 0;
    const platformFeeAmount = Math.round(subtotal * (PLATFORM_FEE_PERCENT / 100) * 100) / 100;
    const penaltyAmount = earlyClose
      ? Math.round(subtotal * (EARLY_CLOSE_PENALTY_PERCENT / 100) * 100) / 100
      : 0;

    const invoice = await Invoice.create({
      publicToken: generatePublicToken(),
      type: "payout_pending",
      question: question._id,
      issuedTo: {
        userId: pro?.user?._id || pro?.user,
        name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Professional",
        email: user?.email || null,
        role: "professional",
      },
      amounts: {
        subtotal,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        platformFeeAmount,
        penaltyPercent: earlyClose ? EARLY_CLOSE_PENALTY_PERCENT : 0,
        penaltyAmount,
        total: payoutAmount,
        currency: "usd",
      },
      stripePaymentIntentId: question.payment?.paymentReference || null,
      notes: `Pending payout for question: "${question.title}" — will be transferred when Stripe account is ready.`,
    });

    // Non-blocking email notifying professional about pending payout
    try {
      const html = payoutPendingTemplate({
        logoUrl: process.env.APP_LOGO_URL,
        proName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "Professional",
        invoiceNumber: String(invoice._id).slice(-8),
        invoiceDate: invoice.createdAt ? invoice.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
        questionTitle: question.title,
        payoutAmountUSD: payoutAmount,
        invoiceUrl: buildPublicInvoiceUrl(invoice.publicToken),
        supportEmail: process.env.SUPPORT_EMAIL,
      });
      const subject = `AskMeDirect — Pending payout recorded (${formatUSD(payoutAmount)})`;
      sendInvoiceEmail(user?.email || process.env.SUPPORT_EMAIL, subject, html);
    } catch (mailErr) {
      console.error("[InvoiceService] payout pending email prep failed:", mailErr);
    }

    return invoice;
  } catch (err) {
    console.error("[InvoiceService] createPayoutPendingInvoice failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: build the public invoice URL
// ---------------------------------------------------------------------------
export function buildPublicInvoiceUrl(publicToken) {
  const base = process.env.APP_BASE_URL || "https://yourapp.com";
  return `${base}/invoices/view/${publicToken}`;
}