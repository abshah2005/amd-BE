import mongoose from "mongoose";

const AskerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true, unique: true },
  },
  { timestamps: true }
);

export const Asker = mongoose.model("Asker", AskerSchema);