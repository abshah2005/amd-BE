import { Question } from "../models/Question.model.js";
import { Professional } from "../models/Professional.model.js";
import { Users } from "../models/Users.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { handleAttachments } from "../utils/Attachments.js";
import { Feedback } from "../models/FeedbackSchema.model.js";
// import Stripe from "stripe";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createQuestion = asynchandler(async (req, res) => {
  const { title, body, professionalId, deliveryType = "normal" } = req.body;
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
    attachments: attachmentsList,
    professional: pro._id,
    deliveryType,
    status: "submitted",
    timeline: [{ at: new Date(), status: "submitted", by: req.user._id }],
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

export const approveAndQuoteQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { amount, message, answerBy } = req.body;

  if (!amount) throw new Apierror(400, "amount required");
  if (!answerBy) throw new Apierror(400, "answerBy (date/time) required");

  const q = await Question.findById(id);
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");

  q.quote = { amount, message, createdAt: new Date() };
  q.price = amount;
  q.status = "quoted";
  q.answerBy = new Date(answerBy);
  q.timeline.push({
    at: new Date(),
    status: "approved_and_quoted",
    by: req.user._id,
    note: message,
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
  //   const paymentIntent = await stripe.paymentIntents.create({
  //     amount: Math.round(q.price * 100),
  //     currency: "usd",
  //     metadata: { questionId: q._id.toString() },
  //   });
  //   q.payment = {
  //     paid: false,
  //     paymentProvider: "stripe",
  //     paymentReference: paymentIntent.id,
  //   };
  //   q.status = "awaiting_payment";
  q.payment = {
    paid: true,
    paymentProvider: "stripe",
    paymentReference: "Some Random ass id for now",
  };
  q.status = "awaiting_response";
  await q.save();
  //   return res.status(200).json(new Apiresponse(200, { clientSecret: paymentIntent.client_secret }, "Payment initiated"));
  return res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { clientSecret: "Some Random ass client secret for now", question: q },
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
  q.timeline.push({ at: new Date(), status: "answered", by: req.user._id });
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
  q.timeline.push({ at: new Date(), status: "in_thread", by: req.user._id });
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
  let payoutAmount = q.price;
  let penalty = false;
  if (now < q.thread.followUpWindowExpiresAt) {
    payoutAmount = Math.round(q.price * 0.85);
    q.thread.threadClosedEarlier = true;
    penalty = true;
  }
  q.status = "closed";
  q.thread.closedAt = now;
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
  const { id } = req.params; // question id
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

// List questions (for dashboard, etc.)
export const listQuestions = asynchandler(async (req, res) => {
  const { status, professionalId, askerId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (professionalId) filter.professional = professionalId;
  if (askerId) filter.asker = askerId;
  const questions = await Question.find(filter).sort({ createdAt: -1 });
  return res
    .status(200)
    .json(new Apiresponse(200, questions, "Questions listed"));
});
