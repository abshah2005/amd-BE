import { Invoice } from "../models/Invoice.model.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";


export const listInvoices = asynchandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;

  const filter = {};

  if (req.user.role !== "admin") {
    filter["issuedTo.userId"] = req.user._id;
  }

  if (type) {
    filter.type = type;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Invoice.countDocuments(filter);

  const invoices = await Invoice.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate("question", "title status payment.paidAt")
    .lean();

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        invoices,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
      "Invoices retrieved"
    )
  );
});

/**
 * GET /invoices/:id
 * Get a single invoice by MongoDB ID. Requires auth; only the invoice recipient or admin.
 */
export const getInvoiceById = asynchandler(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate("question", "title body status payment deliveryType")
    .lean();

  if (!invoice) throw new Apierror(404, "Invoice not found");

  const isOwner = String(invoice.issuedTo?.userId) === String(req.user._id);
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) throw new Apierror(403, "Access denied");

  return res.status(200).json(new Apiresponse(200, invoice, "Invoice retrieved"));
});

/**
 * GET /invoices/view/:token   (PUBLIC — no auth required)
 * Returns invoice data for email links / public view.
 * Does NOT expose sensitive user data — only what's needed to render the receipt.
 */
export const viewInvoiceByToken = asynchandler(async (req, res) => {
  const { token } = req.params;

  const invoice = await Invoice.findOne({ publicToken: token, status: "issued" })
    .populate("question", "title deliveryType payment.paidAt")
    .lean();

  if (!invoice) throw new Apierror(404, "Invoice not found or has been voided");

  // Strip internal fields before sending publicly
  const publicView = {
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    issuedAt: invoice.createdAt,
    issuedTo: {
      name: invoice.issuedTo?.name,
      role: invoice.issuedTo?.role,
    },
    issuedBy: invoice.issuedBy,
    question: {
      title: invoice.question?.title,
      deliveryType: invoice.question?.deliveryType,
    },
    amounts: invoice.amounts,
    stripePaymentIntentId: invoice.stripePaymentIntentId,
    notes: invoice.notes,
    status: invoice.status,
  };

  return res.status(200).json(new Apiresponse(200, publicView, "Invoice retrieved"));
});