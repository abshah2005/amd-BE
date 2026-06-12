import { Router } from "express";
import {
  listInvoices,
  getInvoiceById,
  viewInvoiceByToken,
} from "../Controllers/Invoices.Controller.js";
import { verifyJWT, trackActive } from "../middlewares/Authentication.middleware.js";

const router = Router();

// Public — no auth (used in emails)
router.get("/view/:token", viewInvoiceByToken);

// Authenticated
router.get("/", verifyJWT, trackActive, listInvoices);
router.get("/:id", verifyJWT, trackActive, getInvoiceById);

export default router;