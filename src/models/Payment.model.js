import mongoose, { Schema } from 'mongoose';

const PaymentMethodSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    provider: { type: String, required: true, enum: ['stripe', 'paypal', 'card', 'bank', 'other'], default: 'card' },
    providerToken: { type: String, select: false },
    providerCustomerId: { type: String, select: false },
    type: { type: String, enum: ['card', 'bank_account', 'paypal', 'other'], default: 'card' },
    card: {
      brand: { type: String },
      last4: { type: String, maxlength: 4 },
      expMonth: { type: Number },
      expYear: { type: Number },
      funding: { type: String }
    },
    rawCard: {
      number: { type: String, select: false },
      expiryMMYY: { type: String, select: false },
      cvc: { type: String, select: false }
    },
    billingDetails: {
      name: { type: String },
      country: { type: String }
    },
    isDefault: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  {
    timestamps: true,
  }
);

export const PaymentMethod = mongoose.model('PaymentMethod', PaymentMethodSchema);
