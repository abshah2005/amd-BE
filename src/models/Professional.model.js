import mongoose from "mongoose";

const ProfessionalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true, unique: true },
    profilePicture: { type: String, default: null },
    title: String,
    associated: String,
    about: [String],
    // selectedSpecializations holds references to Specializations with chosen subcategories — moved from User to Professional for scalability
    selectedSpecializations: [
      {
        specialization: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Specializations",
          required: true,
        },
        subCategories: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
    // backward-compatible fields still available
    subcategories: [String],
    tags: [String],
    priceRangeLow: Number,
    priceRangeHigh: Number,
    currency: { type: String, default: "$" },
    exampleQuestions: [String],
    languages: [String],
    country: String,
    location: String,
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    paymentMethodRef: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" }, // optional
    settings: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Professional = mongoose.model("Professional", ProfessionalSchema);