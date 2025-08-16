import mongoose from "mongoose";

const AdminSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true, unique: true },
  },
  { timestamps: true }
);

export const Admin = mongoose.model("Admin", AdminSchema);
