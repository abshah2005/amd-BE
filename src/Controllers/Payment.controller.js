import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import { Users } from "../models/Users.model.js";
import { PaymentMethod } from "../models/Payment.model.js";


const listPaymentMethods = asynchandler(async (req, res) => {
  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  const methods = await user.getPaymentMethods();
  return res.status(200).json(new Apiresponse(200, methods, 'Payment methods retrieved'));
});

const createPaymentMethod = asynchandler(async (req, res) => {
  const paymentData = req.body.paymentData || req.body;
  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  const created = await user.addPaymentMethod(paymentData);
  return res.status(201).json(new Apiresponse(201, created, 'Payment method added'));
});

const createPaymentMethods = asynchandler(async (req, res) => {
  const paymentList = req.body.paymentData || req.body.paymentMethods || req.body;
  if (!Array.isArray(paymentList)) throw new Apierror(400, 'paymentMethods must be an array');

  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  const created = [];
  for (const paymentData of paymentList) {
    const pm = await user.addPaymentMethod(paymentData);
    const obj = pm.toObject ? pm.toObject() : JSON.parse(JSON.stringify(pm));
    delete obj.providerToken;
    delete obj.providerCustomerId;
    if (obj.rawCard) { delete obj.rawCard?.number; delete obj.rawCard?.cvc; delete obj.rawCard?.expiryMMYY; }
    created.push(obj);
  }

  return res.status(201).json(new Apiresponse(201, created, 'Payment methods added'));
});


const updatePaymentMethod = asynchandler(async (req, res) => {
  const id = req.params.id;
  if (!id) throw new Apierror(400, 'id is required');

  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  const pm = await PaymentMethod.findOne({ _id: id, user: user._id });
  if (!pm) throw new Apierror(404, 'Payment method not found');

  const allowed = ['card', 'billingDetails', 'metadata', 'verified', 'isDefault', 'providerToken', 'providerCustomerId'];
  for (const key of Object.keys(req.body)) {
    if (!allowed.includes(key)) continue;
    if (key === 'isDefault' && req.body.isDefault) {
      await user.setDefaultPaymentMethod(id);
      const updated = await PaymentMethod.findById(id).lean();
      const obj = JSON.parse(JSON.stringify(updated));
      delete obj.providerToken; delete obj.providerCustomerId; if (obj.rawCard) { delete obj.rawCard?.number; delete obj.rawCard?.cvc; delete obj.rawCard?.expiryMMYY; }
      return res.status(200).json(new Apiresponse(200, obj, 'Default payment method set'));
    }
    pm[key] = req.body[key];
  }

  await pm.save();
  const obj = pm.toObject ? pm.toObject() : JSON.parse(JSON.stringify(pm));
  delete obj.providerToken; delete obj.providerCustomerId; if (obj.rawCard) { delete obj.rawCard?.number; delete obj.rawCard?.cvc; delete obj.rawCard?.expiryMMYY; }
  return res.status(200).json(new Apiresponse(200, obj, 'Payment method updated'));
});

const setDefault = asynchandler(async (req, res) => {
  const id = req.params.id || req.body.paymentMethodId;
  if (!id) throw new Apierror(400, 'paymentMethodId is required');
  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  const updated = await user.setDefaultPaymentMethod(id);
  return res.status(200).json(new Apiresponse(200, updated, 'Default payment method set'));
});

const removePaymentMethod = asynchandler(async (req, res) => {
  const id = req.params.id || req.body.paymentMethodId;
  if (!id) throw new Apierror(400, 'paymentMethodId is required');
  const user = await Users.findById(req.user?._id);
  if (!user) throw new Apierror(404, 'User not found');

  await user.removePaymentMethod(id);
  return res.status(200).json(new Apiresponse(200, null, 'Payment method removed'));
});

export {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  setDefault,
  removePaymentMethod,
  createPaymentMethods
};

