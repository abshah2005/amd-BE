import mongoose from "mongoose";
const SpecializationSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true
  },
  subCategories: {
    type: [String],
    required: true,
  }
});


export const SpecializationModel = mongoose.model("Specializations", SpecializationSchema);