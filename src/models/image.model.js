import mongoose from "mongoose";

const ImageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: false },
    bucket: { type: String, required: true },
    key: { type: String, required: true },
    url: { type: String, required: true },
    purpose: { type: String, enum: ["profile", "other"], default: "other" },
    isProfilePic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Image = mongoose.model("Image", ImageSchema);