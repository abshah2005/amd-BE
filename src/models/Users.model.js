import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const UserSchema = new Schema(
  {
    // Authentication fields
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, 'is invalid']
    },
    password: {
      type: String,
      required: function() {
        return this.authProvider === 'email';
      },
      minlength: 8
    },
    authProvider: {
      type: String,
      enum: ['email', 'linkedin'],
      default: 'email',
      required: true
    },
    
    // Registration progress tracking
    registrationStep: {
      type: Number,
      default: 0,
      min: 0,
      max: 3
    },
    isRegistrationComplete: {
      type: Boolean,
      default: false
    },
    
    // Profile information
    firstName: {
      type: String,
      trim: true,
      required: function() {
        return this.isRegistrationComplete;
      }
    },
    lastName: {
      type: String,
      trim: true,
      required: function() {
        return this.isRegistrationComplete;
      }
    },
    // username: {
    //   type: String,
    //   trim: true,
    //   lowercase: true,
    //   required: function() {
    //     return this.isRegistrationComplete;
    //   }
    // },
    profilePic: {
      type: String,
      default: null
    },
    
    // Role information
    role: {
      type: String,
      enum: ['admin', 'asker', 'professional'],
      required: function() {
        return this.registrationStep >= 2;
      }
    },
    
    // Authentication tokens
    refreshToken: {
      type: String,
      select: false
    },
    
    // OTP and password reset
    otp: { 
      type: String,
      select: false
    },
    otpExpiry: { 
      type: Date,
      select: false
    },
    resetPasswordToken: { 
      type: String,
      select: false
    },
    resetPasswordExpires: { 
      type: Date,
      select: false
    },
    
    // LinkedIn-specific fields
    linkedinId: {
      type: String,
      unique: true,
      sparse: true
    },
    linkedinProfileUrl: {
      type: String
    }
  },
  { 
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      }
    }
  }
);

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Password hashing middleware
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Password verification method
UserSchema.methods.isPasswordCorrect = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Token generation methods
UserSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      role: this.role
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

UserSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
  );
};

// Helper method to get registration progress
UserSchema.methods.getRegistrationProgress = function() {
  return {
    currentStep: this.registrationStep,
    isComplete: this.isRegistrationComplete,
    missingFields: this.isRegistrationComplete ? [] : this.getMissingFields()
  };
};

// Method to check missing required fields
UserSchema.methods.getMissingFields = function() {
  const missing = [];
  if (!this.firstName) missing.push('firstName');
  if (!this.lastName) missing.push('lastName');
  if (!this.username) missing.push('username');
  if (this.authProvider === 'email' && !this.password) missing.push('password');
  if (!this.role && this.registrationStep >= 2) missing.push('role');
  return missing;
};

export const Users = mongoose.model("Users", UserSchema);