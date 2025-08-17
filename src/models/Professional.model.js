import mongoose from "mongoose";

const ProfessionalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true, unique: true },
    profilePicture: { type: String, default: null },
    entityType: {
      type: String,
      enum: ['individual', 'firm'],
      default: 'individual'
    },
    firmName: {
      type: String,
      trim: true,
      required: function () { return this.entityType === 'firm'; },
      default: null
    },
    title: String,
    associated: String,
    about: [String],
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
    subcategories: [String],
    tags: [String],
    priceRangeLow: Number,
    priceRangeHigh: Number,
    currency: { type: String, default: "$" },
    exampleQuestions: [String],
    languages: [String],
    country: [String],
    deliveryTime: { type: Number, default: 7 }, 
    verified: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 }, 
  },
  { timestamps: true }
);


ProfessionalSchema.pre('save', function(next) {
  try {
    if (!Array.isArray(this.exampleQuestions)) this.exampleQuestions = this.exampleQuestions ? [this.exampleQuestions] : [];

    
    if (!Array.isArray(this.languages)) this.languages = this.languages ? [this.languages] : [];

    // normalize country
    if (!Array.isArray(this.country)) this.country = this.country ? [this.country] : [];

    
    // derive tags from selectedSpecializations' subCategories
    const sels = Array.isArray(this.selectedSpecializations) ? this.selectedSpecializations : [];
    const subcats = [];
    sels.forEach((s) => {
      if (s && Array.isArray(s.subCategories)) {
        s.subCategories.forEach((sc) => {
          if (sc) subcats.push(String(sc).trim());
        });
      }
    });
    // include existing backward-compatible subcategories field as well
    if (Array.isArray(this.subcategories)) this.subcategories.forEach((sc) => { if (sc) subcats.push(String(sc).trim()); });

    this.tags = Array.from(new Set(subcats.filter(Boolean)));

    next();
  } catch (err) {
    next(err);
  }
});

ProfessionalSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update = this.getUpdate() || {};
    const set = update.$set || update;

    const sels = Array.isArray(set.selectedSpecializations) ? set.selectedSpecializations : [];
    const subcats = [];

    sels.forEach((s) => {
      const scArr = s?.subCategories || s?.subcategories;
      if (Array.isArray(scArr)) {
        scArr.forEach((sc) => { if (sc) subcats.push(String(sc).trim()); });
      }
    });

    if (Array.isArray(set.subcategories)) {
      set.subcategories.forEach((sc) => { if (sc) subcats.push(String(sc).trim()); });
    }

    const tags = Array.from(new Set(subcats.filter(Boolean)));

    if (!update.$set) update.$set = {};
    update.$set.tags = tags;

    this.setUpdate(update);
    next();
  } catch (err) {
    next(err);
  }
});


export const Professional = mongoose.model("Professional", ProfessionalSchema);