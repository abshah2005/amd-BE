import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "is invalid"],
    },
    password: {
      type: String,
      required: function () {
        return this.authProvider === "email";
      },
      minlength: 8,
    },
    authProvider: {
      type: String,
      enum: ["email", "linkedin"],
      default: "email",
      required: true,
    },

    registrationStep: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    isRegistrationComplete: {
      type: Boolean,
      default: false,
    },

    firstName: {
      type: String,
      trim: true,
      required: function () {
        return this.isRegistrationComplete;
      },
    },
    lastName: {
      type: String,
      trim: true,
      required: function () {
        return this.isRegistrationComplete;
      },
    },
    profilePic: {
      type: String,
      default: null,
    },

    role: {
      type: String,
      enum: ["admin", "asker", "professional"],
      required: function () {
        return this.registrationStep >= 2;
      },
    },

    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    professional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professional",
      default: null,
    },
    asker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asker",
      default: null,
    },

    roles: {
      type: [String],
      enum: ["admin", "asker", "professional"],
      default: [],
    },

    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },

    activeRole: {
      type: String,
      enum: ["asker", "professional","admin"],
      default: null,
      index: true,
    },

    lastActiveAt: {
      type: Date,
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },

    refreshToken: {
      type: String,
      select: false,
    },
    accessToken: {
      type: String,
      select: false,
    },

    otp: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
      select: false,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },

    linkedinId: {
      type: String,
      unique: true,
      sparse: true,
    },
    linkedinProfileUrl: {
      type: String,
    },
    paymentMethods: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' }
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      },
    },
  }
);

UserSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      role: this.role,
      roles: this.roles,
      professionalId: this.professional,
      askerId: this.asker,
      isActive: this.isActive,
      isAdmin: this.isAdmin,
      activeRole: this.activeRole,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });
};

UserSchema.methods.getRegistrationProgress = function () {
  return {
    currentStep: this.registrationStep,
    isComplete: this.isRegistrationComplete,
    missingFields: this.isRegistrationComplete ? [] : this.getMissingFields(),
  };
};

UserSchema.methods.getMissingFields = function () {
  const missing = [];
  if (!this.firstName) missing.push("firstName");
  if (!this.lastName) missing.push("lastName");
  if (!this.username) missing.push("username");
  if (this.authProvider === "email" && !this.password) missing.push("password");
  if (!this.role && this.registrationStep >= 2) missing.push("role");
  return missing;
};

UserSchema.methods.addRole = async function (role, opts = {}) {
  role = String(role);
  if (!["admin", "asker", "professional"].includes(role))
    throw new Error("Invalid role");
  if (this.roles.includes(role)) return this; 

  let session = opts.session || null;
  let createdSession = false;
  try {
    if (!session) {
      session = await mongoose.startSession();
      createdSession = true;
      session.startTransaction();
    }

    if (role === "professional") {
      // create Professional doc if missing
      if (!this.professional) {
        const Professional = mongoose.model("Professional");
        const prof = await Professional.create(
          [
            {
              user: this._id,
            },
          ],
          { session: session || undefined }
        );
        this.professional = prof[0]._id;
      }
    }

    if (role === "asker") {
      if (!this.asker) {
        const Asker = mongoose.model("Asker");
        const ask = await Asker.create(
          [
            {
              user: this._id,
            },
          ],
          { session: session || undefined }
        );
        this.asker = ask[0]._id;
      }
    }

    if (role === "admin") {
      this.isAdmin = true;
      // Optional: create Admin doc if you want a separate Admin collection
      const Admin = mongoose.models.Admin ? mongoose.model("Admin") : null;
      if (Admin && !this.admin) {
        const adm = await Admin.create(
          [
            {
              user: this._id,
            },
          ],
          { session: session || undefined }
        );
        this.admin = adm[0]._id;
      }
    }

    this.roles.push(role);


    await this.save({ session: session || undefined });

    if (createdSession) await session.commitTransaction();
    if (createdSession) session.endSession();
    return this;
  } catch (err) {
    if (createdSession) await session.abortTransaction();
    if (createdSession) session.endSession();
    throw err;
  }
};

UserSchema.methods.removeRole = async function (role) {
  role = String(role);
  if (!this.roles.includes(role)) return this;
  // NOTE: we do not automatically delete child role docs to avoid accidental data loss.
  this.roles = this.roles.filter((r) => r !== role);
  if (role === "admin") this.isAdmin = false;
  await this.save();
  return this;
};

// Set the active role for frontend toggling. If the user doesn't yet have the role, add it (creates child doc when required).
UserSchema.methods.setActiveRole = async function (role) {
  if (!role) {
    this.activeRole = null;
    await this.save();
    return this;
  }
  if (!["asker", "professional"].includes(role))
    throw new Error("Invalid active role");

  if (!this.roles.includes(role)) {
    // automatically add role (and its child doc) so frontend toggle works seamlessly
    await this.addRole(role);
  }

  this.activeRole = role;
  await this.save();
  return this;
};

// Convenience helpers
UserSchema.methods.switchToProfessional = async function () {
  if (!this.roles.includes("professional")) await this.addRole("professional");
  this.activeRole = "professional";
  await this.save();
  return this;
};

UserSchema.methods.switchToAsker = async function () {
  if (!this.roles.includes("asker")) await this.addRole("asker");
  this.activeRole = "asker";
  await this.save();
  return this;
};

UserSchema.methods.switchToAdmin = async function () {
  if (!this.roles.includes("admin")) await this.addRole("admin");
  this.activeRole = "admin";
  await this.save();
  return this;
};

UserSchema.methods.getPaymentMethods = async function (opts = {}) {
  const PaymentMethod = mongoose.model('PaymentMethod');
  const methods = await PaymentMethod.find({ user: this._id }).lean();
  const sanitized = methods.map((m) => {
    const obj = JSON.parse(JSON.stringify(m));
    delete obj.providerToken;
    delete obj.providerCustomerId;
    if (obj.rawCard) {
      delete obj.rawCard?.number;
      delete obj.rawCard?.cvc;
      delete obj.rawCard?.expiryMMYY;
    }
    return obj;
  });
  return sanitized.sort((a, b) => (a.isDefault === b.isDefault ? (new Date(b.createdAt) - new Date(a.createdAt)) : (a.isDefault ? -1 : 1)));
};

UserSchema.methods.addPaymentMethod = async function (paymentData = {}) {
  const PaymentMethod = mongoose.model('PaymentMethod');
  // if new method should be default, clear existing defaults
  if (paymentData.isDefault) {
    await PaymentMethod.updateMany({ user: this._id }, { $set: { isDefault: false } });
  }

  // create the payment method document
  const pm = await PaymentMethod.create({
    user: this._id,
    provider: paymentData.provider || 'card',
    providerToken: paymentData.providerToken,
    providerCustomerId: paymentData.providerCustomerId,
    type: paymentData.type || 'card',
    card: paymentData.card || {},
    rawCard: paymentData.rawCard || {},
    billingDetails: paymentData.billingDetails || {},
    isDefault: !!paymentData.isDefault,
    verified: !!paymentData.verified,
    metadata: paymentData.metadata || {}
  });

  // ensure user holds a reference
  if (!this.paymentMethods) this.paymentMethods = [];
  this.paymentMethods.push(pm._id);

  // if not explicitly set default and no default exists, make this default
  if (!paymentData.isDefault) {
    const existingDefault = await PaymentMethod.findOne({ user: this._id, isDefault: true });
    if (!existingDefault) {
      pm.isDefault = true;
      await pm.save();
    }
  }

  await this.save();

  const obj = pm.toObject ? pm.toObject() : JSON.parse(JSON.stringify(pm));
  delete obj.providerToken; delete obj.providerCustomerId; if (obj.rawCard) { delete obj.rawCard.number; delete obj.rawCard.cvc; delete obj.rawCard.expiryMMYY; }
  return obj;
};

UserSchema.methods.setDefaultPaymentMethod = async function (paymentMethodId) {
  const PaymentMethod = mongoose.model('PaymentMethod');
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, user: this._id });
  if (!pm) throw new Error('Payment method not found');

  await PaymentMethod.updateMany({ user: this._id }, { $set: { isDefault: false } });
  pm.isDefault = true;
  await pm.save();

  const obj = pm.toObject ? pm.toObject() : JSON.parse(JSON.stringify(pm));
  delete obj.providerToken; delete obj.providerCustomerId; if (obj.rawCard) { delete obj.rawCard.number; delete obj.rawCard.cvc; delete obj.rawCard.expiryMMYY; }
  return obj;
};

UserSchema.methods.removePaymentMethod = async function (paymentMethodId) {
  const PaymentMethod = mongoose.model('PaymentMethod');
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, user: this._id });
  if (!pm) throw new Error('Payment method not found');
  const wasDefault = !!pm.isDefault;

  await PaymentMethod.deleteOne({ _id: paymentMethodId, user: this._id });

  // remove reference from user
  if (this.paymentMethods && this.paymentMethods.length) {
    this.paymentMethods = this.paymentMethods.filter((id) => String(id) !== String(paymentMethodId));
    await this.save();
  }

  // if it was default, promote the newest payment method to default
  if (wasDefault) {
    const replacement = await PaymentMethod.findOne({ user: this._id }).sort({ createdAt: -1 });
    if (replacement) {
      replacement.isDefault = true;
      await replacement.save();
    }
  }

  return true;
};

UserSchema.methods.getDefaultPaymentMethod = function () {
  // NOTE: keep this synchronous signature for backwards compatibility but return null
  // If callers expect the default, they should use getPaymentMethods or setDefaultPaymentMethod.
  return null;
};

export const Users = mongoose.model("Users", UserSchema);
