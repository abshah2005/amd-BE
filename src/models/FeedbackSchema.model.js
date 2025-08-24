import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  professional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional", required: true },
  asker: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Feedback = mongoose.model("Feedback", FeedbackSchema);