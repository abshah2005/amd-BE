import { Router } from "express";
import { verifyJWT } from "../middlewares/Authentication.middleware.js";
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  setDefault,
  removePaymentMethod,
} from "../Controllers/Payment.controller.js";

const router = Router();

router.route("/").get(verifyJWT, listPaymentMethods).post(verifyJWT, createPaymentMethod);
router.route("/:id").patch(verifyJWT, updatePaymentMethod).delete(verifyJWT, removePaymentMethod);
router.route("/:id/default").patch(verifyJWT, setDefault);

export default router;
