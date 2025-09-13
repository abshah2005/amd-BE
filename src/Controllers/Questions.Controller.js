import { Question } from "../models/Question.model.js";
import { Professional } from "../models/Professional.model.js";
import { Users } from "../models/Users.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { handleAttachments } from "../utils/Attachments.js";
import { Feedback } from "../models/FeedbackSchema.model.js";
import Stripe from "stripe";
import { sendQuestionStatusEmail } from "../utils/Nodemailer.js";
import { getCurrencyCodeFromSymbol } from "../utils/CurrencyUtil.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = parseFloat(
  process.env.PLATFORM_FEE_PERCENT || "12"
);
const EARLY_CLOSE_PENALTY_PERCENT = parseFloat(
  process.env.EARLY_CLOSE_PENALTY_PERCENT || "3"
);

// helper: populate users and send emails to both parties (non-blocking)
async function notifyStatusChange(question, status, customMessage, actionUrl) {
  try {
    // ensure asker and professional.user are populated with email & names
    await question.populate([
      {
        path: "professional",
        populate: {
          path: "user",
          select: "firstName lastName email profilePic",
        },
      },
    ]);
    await question.populate("asker");

    const asker = question.asker;
    const professionalUser = question.professional?.user;

    // send to asker
    if (asker?.email) {
      sendQuestionStatusEmail({
        recipientType: "asker",
        status,
        question,
        recipient: asker,
        customMessage,
        actionUrl,
      }).catch((err) => console.error("Email to asker failed:", err));
    }

    // send to professional
    if (professionalUser?.email) {
      sendQuestionStatusEmail({
        recipientType: "professional",
        status,
        question,
        recipient: professionalUser,
        customMessage,
        actionUrl,
      }).catch((err) => console.error("Email to professional failed:", err));
    }
  } catch (err) {
    console.error("notifyStatusChange error:", err);
  }
}

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
    const files = Array.isArray(req.files.attachments)
      ? req.files.attachments
      : [req.files.attachments];
    attachmentsList = await handleAttachments(files);
  }
  if (!title || !body || !professionalId)
    throw new Apierror(400, "title, body, professionalId required");
  const pro = await Professional.findById(professionalId);
  if (!pro) throw new Apierror(404, "Professional not found");

  const q = await Question.create({
    title,
    body,
    asker: req.user._id,
    proposedBudget: budget,
    attachments: attachmentsList,
    professional: pro._id,
    deliveryType,
    editorState: editorState,
    status: "submitted",
    timeline: [
      {
        at: new Date(),
        status: "question_asked",
        by: req.user._id,
        note: body,
      },
      {
        at: new Date(Date.now() + 30 * 1000),
        status: "submitted",
        by: req.user._id,
        note: "Your question has been received by the professional. You'll receive a response or custom quote soon.",
      },
    ],
  });
  notifyStatusChange(q, "submitted").catch(() => {});
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
    note: message ? message : "Sorry, I cannot answer this question.",
  });
  await q.save();
  notifyStatusChange(q, "rejected", message).catch(() => {});
  return res.status(200).json(new Apiresponse(200, q, "Question rejected"));
});

export const deleteQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;

  const question = await Question.findById(id);
  if (!question) throw new Apierror(404, "Question not found");

  if (
    String(question.asker) !== String(req.user._id) &&
    req.user.role !== "admin"
  ) {
    throw new Apierror(
      403,
      "You don't have permission to delete this question"
    );
  }

  await Question.findByIdAndDelete(id);

  return res
    .status(200)
    .json(
      new Apiresponse(200, null, "Question marked as deleted successfully")
    );
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
  notifyStatusChange(q, "approved").catch(() => {});
  return res.status(200).json(new Apiresponse(200, q, "Question approved"));
});

export const approveAndQuoteQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { normalAmount, fastAmount, answerByNormal, answerByFast } = req.body;

  if (!normalAmount && !fastAmount)
    throw new Apierror(400, "At least one quote amount required");

  const q = await Question.findById(id).populate("professional");
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.professional._id) !== String(req.user.professional._id))
    throw new Apierror(403, "Not professional");

  q.quote = {
    normal: normalAmount
      ? {
          amount: normalAmount,
          createdAt: new Date(),
          message: "Normal delivery quote",
        }
      : undefined,
    fast: fastAmount
      ? {
          amount: fastAmount,
          createdAt: new Date(),
          message: "Fast delivery quote",
        }
      : undefined,
  };

  // Set answerBy for each type if provided
  if (answerByNormal) q.answerByNormal = new Date(answerByNormal);
  if (answerByFast) q.answerByFast = new Date(answerByFast);

  q.status = "quoted";
  q.timeline.push({
    at: new Date(),
    status: "approved_and_quoted",
    by: req.user._id,
    note: `Quotes posted: normal ${q.professional.currency}${normalAmount || "-"}, fast ${q.professional.currency}${
      fastAmount || "-"
    }`,
  });

  await q.save();
  notifyStatusChange(q, "quoted").catch(() => {});
  return res
    .status(200)
    .json(new Apiresponse(200, q, "Quotes posted for both delivery types"));
});

export const payQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;
  const { deliveryType } = req.body;
  const q = await Question.findById(id).populate("professional");
  if (!q) throw new Apierror(404, "Question not found");
  if (String(q.asker) !== String(req.user._id))
    throw new Apierror(403, "Not asker");
  if (
    q.status !== "approved" &&
    q.status !== "quoted" &&
    q.status !== "awaiting_payment"
  )
    throw new Apierror(400, "Not approved or quoted yet");

  let price = 0;
  if (deliveryType === "fast" && q.quote.fast?.amount) {
    price = q.quote.fast.amount;
    q.deliveryType = "fast";
    if (q.answerByFast) q.answerBy = q.answerByFast;
  } else if (deliveryType === "normal" && q.quote.normal?.amount) {
    price = q.quote.normal.amount;
    q.deliveryType = "normal";
    if (q.answerByNormal) q.answerBy = q.answerByNormal;
  } else {
    throw new Apierror(400, "Invalid delivery type or quote not available");
  }
  q.price = price;

  const professionalCurrencySymbol = q.professional.currency || "$"; 
  console.log(professionalCurrencySymbol);// Default to USD if not set
  const currency = getCurrencyCodeFromSymbol(professionalCurrencySymbol);
  console.log(currency);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(price * 100),
    currency: currency,
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
    note: `Tap 'Pay Now' to confirm question's budget for ${deliveryType} delivery.`,
  });
  await q.save();
  notifyStatusChange(q, "awaiting_payment").catch(() => {});
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

export const paidStatusQuestion = asynchandler(async (req, res) => {
  const { id } = req.params;

  const q = await Question.findById(id);
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

  await q.save();
  notifyStatusChange(q, "paid").catch(() => {});
  return res.status(200).json(new Apiresponse(200, q, "Question paid"));
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

export const postAnswer = asynchandler(async (req, res) => {
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

  if (q.status === "paid" || q.status === "awaiting_response") {
    q.thread.messages.push({
      sender: req.user._id,
      role: "professional",
      body,
      attachments: attachmentsList,
      isFollowUp: false,
    });
    q.status = "answered";
    q.thread.followUpWindowExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);
  } else if (q.status === "in_thread" || q.status === "answered") {
    // Follow-up answer logic
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
    // q.timeline.push({
    //   at: new Date(),
    //   status: "followup_answered",
    //   by: req.user._id,
    //   note: "Follow-up question answered.",
    // });
  } else {
    throw new Apierror(400, "Invalid status for posting an answer");
  }

  await q.save();
  if (q.status === "answered") {
    notifyStatusChange(q, "answered").catch(() => {});
  }
  return res
    .status(200)
    .json(new Apiresponse(200, q, "Answer posted successfully"));
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
  // q.timeline.push({
  //   at: new Date(),
  //   status: "in_thread",
  //   by: req.user._id,
  //   note: "Follow-up question asked.",
  // });
  await q.save();
  notifyStatusChange(q, "in_thread").catch(() => {});
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
  const { body } = req.body;
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
    note: "Thread closed by professional. " + (body ? `Note: ${body}` : ""),
  });

  await q.save();

  if (q.professional.professionalStripeId) {
    await stripe.transfers.create({
      amount: Math.round(payoutAmount * 100),
      currency: getCurrencyCodeFromSymbol(q.professional.currency),
      destination: q.professional.professionalStripeId,
      metadata: { questionId: q._id.toString() },
    });
    console.log(
      `Initiating payout of $${payoutAmount} to professional ${q.professional._id}`
    );
  }
  notifyStatusChange(q, "closed", body).catch(() => {});
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
  q.feedback = feedback._id;
  await q.save();
  const ratings = prof.feedbacks.map((fb) => fb.rating);
  prof.rating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  prof.ratingCount = ratings.length;
  await prof.save();

  return res
    .status(200)
    .json(new Apiresponse(200, feedback, "Feedback submitted"));
});

// Get question by ID endpoint - add this with your other exports
export const getQuestionById = asynchandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new Apierror(400, "Question ID is required");
  }
  const question = await Question.findById(id)
    .populate({
      path: "professional",
      populate: {
        path: "user",
        select: "firstName lastName profilePic",
      },
    })
    .populate({
      path: "asker",
      select: "firstName lastName profilePic",
    })
    .populate({
      path: "thread.messages.sender",
      select: "firstName lastName profilePic",
    })
    .populate("feedback");

  if (!question) {
    throw new Apierror(404, "Question not found");
  }

  const isAsker = String(question.asker._id) === String(req.user._id);
  const isProfessional =
    req.user.professional &&
    String(question.professional._id) === String(req.user.professional._id);

  if (!isAsker && !isProfessional && req.user.role !== "admin") {
    throw new Apierror(
      403,
      "You don't have permission to access this question"
    );
  }

  return res
    .status(200)
    .json(new Apiresponse(200, question, "Question retrieved successfully"));
});

// ...existing code...
export const listQuestions = asynchandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const filter = {};

  // Admin should see everything — do not add asker/professional filters for admin
  if (req.user.role !== "admin") {
    if (req.user.activeRole === "professional" && req.user.professional) {
      filter.professional = req.user.professional._id;
    } else if (req.user.activeRole === "asker") {
      filter.asker = req.user._id;
    }
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

// export const listQuestions = asynchandler(async (req, res) => {
//   const { status, page = 1, limit = 10 } = req.query;
//   const filter = {};

//   if (req.user.activeRole === "professional" && req.user.professional) {
//     filter.professional = req.user.professional._id;
//   } else if (req.user.activeRole === "asker") {
//     filter.asker = req.user._id;
//   }

//   if (status) {
//     // Accept comma-separated string or array
//     const statusList = Array.isArray(status)
//       ? status
//       : typeof status === "string"
//       ? status.split(",")
//       : [status];
//     filter.status = { $in: statusList };
//   }

//   const skip = (parseInt(page) - 1) * parseInt(limit);
//   const total = await Question.countDocuments(filter);
//   const questions = await Question.find(filter)
//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(parseInt(limit))
//     .populate({
//       path: "professional",
//       populate: {
//         path: "user",
//         select: "firstName lastName",
//       },
//     })
//     .populate({
//       path: "asker",
//       select: "firstName lastName",
//     });

//   return res.status(200).json(
//     new Apiresponse(
//       200,
//       {
//         questions,
//         total,
//         page: parseInt(page),
//         limit: parseInt(limit),
//         totalPages: Math.ceil(total / limit),
//       },
//       "Questions listed"
//     )
//   );
// });
