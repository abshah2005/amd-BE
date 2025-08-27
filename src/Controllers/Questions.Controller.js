import { Question } from "../models/Question.model.js";
import { Professional } from "../models/Professional.model.js";
import { Users } from "../models/Users.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { handleAttachments } from "../utils/Attachments.js";
import { Feedback } from "../models/FeedbackSchema.model.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = parseFloat(
  process.env.PLATFORM_FEE_PERCENT || "12"
);
const EARLY_CLOSE_PENALTY_PERCENT = parseFloat(
  process.env.EARLY_CLOSE_PENALTY_PERCENT || "3"
);

export const createQuestion = asynchandler(async (req, res) => {
  const {
    title,
    body,
    professionalId,
    deliveryType = "normal",
    editorState,
    budget,
  } = req.body;
  let attachmentsList = [];
  if (req.files?.attachments) {
    attachmentsList = await handleAttachments(req.files.attachments);
  }
  if (!title || !body || !professionalId)
    throw new Apierror(400, "title, body, professionalId required");
  const pro = await Professional.findById(professionalId);
  if (!pro) throw new Apierror(404, "Professional not found");

  const q = await Question.create({
    title,
    body,
    asker: req.user._id,
    proposedBudget: budget.typeofbudget === "number" ? budget : 0,
    attachments: attachmentsList,
    professional: pro._id,
    deliveryType,
    editorState: editorState,
    status: "submitted",
    timeline: [
      {
        at: new Date(),
        status: "submitted",
        by: req.user._id,
        note: "Your question has been received by the professional. You'll receive a response or custom quote soon.",
      },
    ],
  });
  return res.status(201).json(new Apiresponse(201, q, "Question created"));
});

export const rejectQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");
  q.status = "rejected";
  q.timeline.push({
    at: new Date(),
    status: "rejected",
    by: req.user._id,
    note: message ? message : "Sorry i cant Answer this Question",
  });
  await q.save();
  return res.status(200).json(new Apiresponse(200, q, "Question rejected"));
});

export const approveQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;

  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");

  q.status = "approved";
  q.timeline.push({
    at: new Date(),
    status: "approved",
    by: req.user._id,
    note: "Question approved by professional.",
  });

  await q.save();
  return res.status(200).json(new Apiresponse(200, q, "Question approved"));
});

export const approveAndQuoteQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { amount, answerBy } = req.body;

  if (!amount) throw new Apierror(400, "amount required");
  if (!answerBy) throw new Apierror(400, "answerBy (date/time) required");

  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");

  q.quote = { amount, createdAt: new Date() };
  q.price = amount;
  q.status = "quoted";
  q.answerBy = new Date(answerBy);
  q.timeline.push({
    at: new Date(),
    status: "approved_and_quoted",
    by: req.user._id,
    note: `The price for the question is set to $${q.price} from the professional.`,
  });

  await q.save();
  return res
    .status(200)
    .json(new Apiresponse(200, q, "Question approved and quote posted"));
});

// Pay for question (Stripe PaymentIntent)
export const payQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.asker) !== String(req.user._id))
    throw new Apierror(403, "Not asker");
  if (q.status !== "approved" && q.status !== "quoted")
    throw new Apierror(400, "Not approved or quoted yet");
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(q.price * 100),
    currency: "usd",
    metadata: { questionId: q._id.toString() },
  });
  q.payment = {
    paid: false,
    paymentProvider: "stripe",
    paymentReference: paymentIntent.id,
  };
  q.status = "awaiting_payment";
  q.timeline.push({
    at: new Date(),
    status: "payment_awaiting",
    by: req.user._id,
    note: "Tap 'Pay Now' to confirm question's budget.",
  });
  await q.save();
  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { clientSecret: paymentIntent.client_secret },
        "Payment initiated"
      )
    );
});

// Stripe webhook for payment confirmation
export const stripeWebhook = asynchandler(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const q = await Question.findOne({
      "payment.paymentReference": paymentIntent.id,
    });
    if (q) {
      q.payment.paid = true;
      q.payment.paidAt = new Date();
      q.status = "paid";
      q.timeline.push({
        at: new Date(),
        status: "paid",
        by: q.asker,
        note: "Your payment is complete! 🎉 We've notified the professional — they'll review your question and respond within the selected delivery time.",
      });
      await q.save();
    }
  }
  res.status(200).send("Received");
});

// Professional posts answer (starts 48h window)
export const postAnswer = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  let attachmentsList = [];
  if (req.files?.attachments) {
    attachments = await handleAttachments(req.files.attachments);
  }
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");
  if (q.status !== "paid" && q.status !== "awaiting_response")
    throw new Apierror(400, "Not paid yet");
  q.thread.messages.push({
    sender: req.user._id,
    role: "professional",
    body,
    attachments: attachmentsList,
    isFollowUp: false,
  });
  q.status = "answered";
  q.thread.followUpWindowExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);
  q.timeline.push({
    at: new Date(),
    status: "answered",
    by: req.user._id,
    note: "Your question has been answered. You can ask a follow up question.",
  });
  await q.save();
  return res.status(200).json(new Apiresponse(200, q, "Answer posted"));
});

// Asker posts follow-up (within 48h window)
export const postFollowUp = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  let attachmentsList = [];
  if (req.files?.attachments) {
    attachments = await handleAttachments(req.files.attachments);
  }
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.asker) !== String(req.user._id))
    throw new Apierror(403, "Not asker");
  if (
    !q.thread.followUpWindowExpiresAt ||
    new Date() > new Date(q.thread.followUpWindowExpiresAt)
  )
    throw new Apierror(400, "Follow-up window expired");
  q.thread.messages.push({
    sender: req.user._id,
    role: "asker",
    body,
    attachments: attachmentsList,
    isFollowUp: true,
  });
  q.status = "in_thread";
  q.timeline.push({
    at: new Date(),
    status: "in_thread",
    by: req.user._id,
    note: "Follow-up question asked.",
  });
  await q.save();
  return res.status(200).json(new Apiresponse(200, q, "Follow-up posted"));
});

export const answerFollowUp = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  let attachmentsList = [];
  if (req.files?.attachments) {
    attachmentsList = await handleAttachments(req.files.attachments);
  }
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");
  if (q.status !== "in_thread")
    throw new Apierror(400, "Thread not active for follow-up answers");
  if (
    !q.thread.followUpWindowExpiresAt ||
    new Date() > new Date(q.thread.followUpWindowExpiresAt)
  )
    throw new Apierror(400, "Follow-up window expired");
  q.thread.messages.push({
    sender: req.user._id,
    role: "professional",
    body,
    attachments: attachmentsList,
    isFollowUp: true,
  });
  q.timeline.push({
    at: new Date(),
    status: "followup_answered",
    by: req.user._id,
    note: "Follow-up question answered.",
  });
  await q.save();
  return res
    .status(200)
    .json(new Apiresponse(200, q, "Follow-up answer posted"));
});

// Professional closes thread (payout logic)
export const closeThreadAndPayout = asynchandler(async (req, res) => {
  const { id } = req.params;
  const q = await Question.findById(id).populate("professional");
  if (!q) throw new Apierror(404, "Question not found");
  if (q.status === "closed") throw new Apierror(400, "Already closed");
  if (!q.payment.paid) throw new Apierror(400, "Not paid");
  if (String(q.professional._id) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");

  const now = new Date();
  let totalFeePercent = PLATFORM_FEE_PERCENT;
  let penalty = false;
  if (now < q.thread.followUpWindowExpiresAt) {
    totalFeePercent += EARLY_CLOSE_PENALTY_PERCENT;
    q.thread.threadClosedEarlier = true;
    penalty = true;
  }
  const payoutAmount = Math.round(q.price * (1 - totalFeePercent / 100));
  console.log(`Payout amount for question ${q._id} is $${payoutAmount} (fees)`);
  q.status = "closed";
  q.thread.closedAt = now;
  q.timeline.push({
    at: new Date(),
    status: "closed",
    by: req.user._id,
    note: "Thread closed and payout sent.",
  });

  await q.save();

  if (q.professional.professionalStripeId) {
    await stripe.transfers.create({
      amount: Math.round(payoutAmount * 100),
      currency: "usd",
      destination: q.professional.professionalStripeId,
      metadata: { questionId: q._id.toString() },
    });
  }
  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        q,
        penalty
          ? "Thread closed early, payout deducted"
          : "Thread closed and payout sent"
      )
    );
});

export const submitFeedback = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.asker) !== String(req.user._id))
    throw new Apierror(403, "Not asker");
  if (q.status !== "closed") throw new Apierror(400, "Thread not closed yet");
  if (!rating || !comment)
    throw new Apierror(400, "Rating and comment required");

  const existing = await Feedback.findOne({
    question: q._id,
    asker: req.user._id,
  });
  if (existing)
    throw new Apierror(400, "Feedback already submitted for this question");

  const feedback = await Feedback.create({
    question: q._id,
    professional: q.professional,
    asker: req.user._id,
    rating,
    comment,
  });

  await Professional.findByIdAndUpdate(q.professional, {
    $push: { feedbacks: feedback._id },
  });

  const prof = await Professional.findById(q.professional).populate(
    "feedbacks"
  );
  const ratings = prof.feedbacks.map((fb) => fb.rating);
  prof.rating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  prof.ratingCount = ratings.length;
  await prof.save();

  return res
    .status(200)
    .json(new Apiresponse(200, feedback, "Feedback submitted"));
});

export const listQuestions = asynchandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filter = {};

  if (req.user.activeRole === "professional" && req.user.professional) {
    filter.professional = req.user.professional._id;
  } else if (req.user.activeRole === "asker") {
    filter.asker = req.user._id;
  }

  if (status) {
    // Accept comma-separated string or array
    const statusList = Array.isArray(status)
      ? status
      : typeof status === "string"
      ? status.split(",")
      : [status];
    filter.status = { $in: statusList };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Question.countDocuments(filter);
  const questions = await Question.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate({
      path: "professional",
      populate: {
        path: "user",
        select: "firstName lastName",
      },
    })
    .populate({
      path: "asker",
      select: "firstName lastName",
    });

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        questions,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      "Questions listed"
    )
  );
});
