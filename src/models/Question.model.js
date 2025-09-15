import mongoose, { Schema } from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    role: { type: String, enum: ["asker", "professional"], required: true },
    body: { type: String, required: true },
    attachments: [String],
    createdAt: { type: Date, default: Date.now },
    isFollowUp: { type: Boolean, default: false },
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    asker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professional",
      required: true,
      index: true,
    },
    price: { type: Number, default: 0 },
    proposedBudget: { type: Number, default: 0 },
    feedback:{
     type: mongoose.Schema.Types.ObjectId,
      ref: "Feedback",
    },
    quote: {
      normal: {
        amount: Number,
        message: String,
        createdAt: Date,
      },
      fast: {
        amount: Number,
        message: String,
        createdAt: Date,
      },
    },
    deliveryType: {
      type: String,
      enum: ["normal", "fast"],
      default: "normal",
    },
    answerBy: { type: Date },
    answerByNormal: { type: Date },
    isDeleted: { type: Boolean, default: false },
    answerByFast: { type: Date },
    editorState: { type: String },
    attachments: [String],
    payment: {
      paid: { type: Boolean, default: false },
      paymentProvider: String,
      paymentReference: String,
      paidAt: Date,
    },
    status: {
      type: String,
      enum: [
        "submitted",
        "approved",
        "rejected",
        "flagged",
        "unflagged",
        "quoted",
        "awaiting_payment",
        "paid",
        "awaiting_response",
        "answered",
        "in_thread",
        "closed",
        "cancelled",
      ],
      default: "submitted",
      index: true,
    },
    thread: {
      messages: [MessageSchema],
      followUpWindowExpiresAt: Date,
      closedAt: Date,
      threadClosedEarlier: { type: Boolean, default: false },
    },
    timeline: [
      {
        at: Date,
        status: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

export const Question = mongoose.model("Question", QuestionSchema);
