import dotenv from "dotenv";
import sgMail from "@sendgrid/mail";

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendEmail = async (to, subject, html) => {
  try {
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      html,
    };
    await sgMail.send(msg);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error.response?.body || error);
    throw new Error("Failed to send email");
  }
};

export const sendInvoiceEmail = (to, subject, html) => {
  if (!to) {
    console.warn("[sendInvoiceEmail] no recipient, skipping email");
    return;
  }
  sendEmail(to, subject, html)
    .then(() => console.log(`[InvoiceEmail] sent to ${to}`))
    .catch((err) =>
      console.error(`[InvoiceEmail] failed to send to ${to}:`, err.message || err)
    );
};

function shouldSkipEmail(status, recipientType) {
  // Define combinations of status and recipient type for which emails should be skipped
  const skipCombinations = [
    // Skip "Question Approved" email for professionals
    { status: "approved", recipientType: "professional" },
    
    // Skip "Payment Pending" email for professionals
    { status: "awaiting_payment", recipientType: "professional" },
    
    // Add more combinations here as needed
    // { status: "status_name", recipientType: "asker_or_professional" },
  ];

  return skipCombinations.some(
    combo => combo.status === status && combo.recipientType === recipientType
  );
}

export const sendQuestionStatusEmail = async (options) => {
  const {
    recipientType,
    status,
    question,
    recipient,
    customMessage,
    actionUrl,
  } = options;

  if (!recipient || !recipient.email) {
    console.error("Cannot send email: recipient email missing");
    return;
  }

  if (shouldSkipEmail(status, recipientType)) {
    console.log(`Skipping email for status: ${status} and recipient: ${recipientType}`);
    return;
  }

  // Get other party's name
  const otherParty =
    recipientType === "asker"
      ? `${question.professional?.firstName || ""} ${
          question.professional?.lastName || ""
        }`.trim()
      : `${question.asker?.firstName || ""} ${
          question.asker?.lastName || ""
        }`.trim();

  // Default action URL points to question detail page
  const questionLink = `${process.env.FRONTEND_URL}/questions`;

  // Configure email details based on status and recipient
  const emailConfig = getEmailConfigByStatus(
    status,
    recipientType,
    question,
    otherParty,
    customMessage
  );

  if (!emailConfig) {
    console.log(
      `No email configuration for status: ${status} and recipient: ${recipientType}`
    );
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">${emailConfig.title}</h2>
      </div>
      
      <div style="color: #555; line-height: 1.5;">
        <p>Hello ${recipient.firstName || "there"},</p>
        
        <p>${emailConfig.message}</p>
        
        ${customMessage ? `<p>${customMessage}</p>` : ""}
        
        <div style="margin: 25px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #007bff; border-radius: 3px;">
          <p style="margin: 0; font-weight: bold;">Question: ${
            question.title
          }</p>
          ${
            question.price
              ? `<p style="margin: 5px 0 0 0;">Paid: $${question.price}</p>`
              : ""
          }
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${questionLink}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
            ${emailConfig.buttonText}
          </a>
        </div>
        
        <p>Thank you for using AskMeDirect.</p>
        
        <p>Best regards,<br>The AskMeDirect Team</p>
      </div>
      
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #777; text-align: center;">
        <p>If you have any questions, please contact our support team at ${
          process.env.SUPPORT_EMAIL || "support@askmedirect.com"
        }</p>
      </div>
    </div>
  `;

  await sendEmail(recipient.email, emailConfig.subject, html);
};



function getEmailConfigByStatus(
  status,
  recipientType,
  question,
  otherParty,
  customMessage
) {
  // Default values
  const configs = {
    submitted: {
      asker: {
        subject: "Your Question Has Been Submitted",
        title: "Question Submitted Successfully",
        message: `Your question has been sent to ${otherParty}. They'll review it soon.`,
        buttonText: "View Your Question",
      },
      professional: {
        subject: "New Question Received",
        title: "You Have a New Question",
        message: `${otherParty} has submitted a new question for you to review.`,
        buttonText: "Review Question",
      },
    },

    approved: {
      asker: {
        subject: "Your Question Has Been Approved",
        title: "Question Approved",
        message: `Great news! ${otherParty} has approved your question and will provide an answer soon.`,
        buttonText: "View Status",
      },
      professional: {
        subject: "Question Approved",
        title: "Question Approved",
        message:
          "You've approved this question. Please provide a quote or answer soon.",
        buttonText: "Provide Quote",
      },
    },

    rejected: {
      asker: {
        subject: "Your Question Has Been Declined",
        title: "Question Not Accepted",
        message: `${otherParty} was unable to accept your question at this time.`,
        buttonText: "View Details",
      },
      professional: {
        subject: "Question Rejected",
        title: "Question Rejected",
        message: "You've declined to answer this question.",
        buttonText: "View Details",
      },
    },

    quoted: {
      asker: {
        subject: "Quote Available for Your Question",
        title: "Your Question Has Been Quoted",
        message: `${otherParty} has provided a quote for your question. Please review and proceed with payment if you'd like to receive an answer.`,
        buttonText: "Review Quote",
      },
      professional: {
        subject: "Quote Sent",
        title: "Quote Sent Successfully",
        message:
          "Your quote has been sent to the asker. We'll notify you when they make a payment.",
        buttonText: "View Question",
      },
    },

    awaiting_payment: {
      asker: {
        subject: "Payment Required for Your Question",
        title: "Complete Your Payment",
        message: "Please complete the payment to receive your answer.",
        buttonText: "Make Payment",
      },
      professional: {
        subject: "Payment Pending for Question",
        title: "Payment Pending",
        message:
          "The asker has initiated payment for this question. You'll be notified once payment is complete.",
        buttonText: "View Question",
      },
    },


    flagged: {
      admin: {
        subject: "Question Flagged for Review",
        title: "Question Flagged",
        message: `A question has been flagged for review. Please review this question and take appropriate action.`,
        buttonText: "Review Flagged Question",
      },
      professional: {
        subject: "Question Flagged for Review",
        title: "Question Has Been Flagged",
        message: `The asker has flagged this question for review. Our team will review the case and may contact you with further instructions.`,
        buttonText: "View Question",
      },
      asker: {
        subject: "Question Flag Confirmation",
        title: "Question Flagged Successfully",
        message: `Your flag has been submitted. Our team will review your concern and take appropriate action.`,
        buttonText: "View Question",
      },
    },

    flag_reviewed_reanswer: {
      professional: {
        subject: "Action Required: Flagged Question Review Complete",
        title: "Please Provide a New Answer",
        message: `An administrator has reviewed the flagged question and requests that you provide a new answer to address the concern.`,
        buttonText: "Provide New Answer",
      },
      asker: {
        subject: "Flag Review Complete",
        title: "Your Flag Has Been Reviewed",
        message: `Our team has reviewed your flagged question. The professional has been asked to provide a new answer to address your concern.`,
        buttonText: "View Question",
      },
    },

    flag_reviewed_refund: {
      professional: {
        subject: "Question Refunded After Review",
        title: "Question Refunded",
        message: `After reviewing the flagged question, our team has decided to issue a refund to the asker.`,
        buttonText: "View Question",
      },
      asker: {
        subject: "Refund Approved for Your Question",
        title: "Refund Approved",
        message: `Our team has reviewed your flagged question and approved a refund. The refund will be processed shortly.`,
        buttonText: "View Question",
      },
    },

    flag_reviewed_no_action: {
      professional: {
        subject: "Flagged Question Review Complete",
        title: "Flag Review Complete - No Action Required",
        message: `Our team has reviewed the flagged question and determined that no further action is required.`,
        buttonText: "View Question",
      },
      asker: {
        subject: "Flag Review Complete",
        title: "Flag Review Complete",
        message: `Our team has reviewed your flagged question and determined that no further action is needed at this time.`,
        buttonText: "View Question",
      },
    },

    paid: {
      asker: {
        subject: "Payment Confirmed - Awaiting Answer",
        title: "Payment Confirmed",
        message: `Thank you for your payment. ${otherParty} will provide an answer soon.`,
        buttonText: "View Question",
      },
      professional: {
        subject: "Payment Received - Answer Required",
        title: "Payment Received",
        message: `Payment has been received for this question. Please provide your answer${
          question.deliveryType === "fast" ? " with expedited delivery" : ""
        }.`,
        buttonText: "Answer Question",
      },
    },

    answered: {
      asker: {
        subject: "Your Question Has Been Answered!",
        title: "Answer Received",
        message: `${otherParty} has answered your question. You can review the answer and ask follow-up questions within the next 48 hours.`,
        buttonText: "View Answer",
      },
      professional: {
        subject: "Answer Submitted",
        title: "Answer Submitted",
        message:
          "Your answer has been submitted. The asker can now review it and may ask follow-up questions within 48 hours.",
        buttonText: "View Thread",
      },
    },

    in_thread: {
      asker: {
        subject: "Follow-up Response Needed",
        title: "Follow-up Question Sent",
        message: `Your follow-up question has been sent to ${otherParty}.`,
        buttonText: "View Conversation",
      },
      professional: {
        subject: "Follow-up Question Received",
        title: "New Follow-up Question",
        message:
          "The asker has sent a follow-up question. Please respond to continue the conversation.",
        buttonText: "View & Respond",
      },
    },

    closed: {
      asker: {
        subject: "Question Thread Closed",
        title: "Thread Closed",
        message:
          "This question thread has been closed. Please provide feedback on your experience.",
        buttonText: "Leave Feedback",
      },
      professional: {
        subject: "Thread Closed - Payment Processing",
        title: "Thread Closed",
        message: "You've closed this thread. Your payment is being processed.",
        buttonText: "View Details",
      },
    },
  };

  // Return the appropriate config or undefined if not found
  return configs[status]?.[recipientType];
}


export function paymentReceivedTemplate({ logoUrl, askerName, invoiceNumber, invoiceDate, questionTitle, subtotalUSD, invoiceUrl, supportEmail }) {
  const primary = "#0070F3";
  const accent = "#00B5D8";
  const secondary = "#6C63FF";

  return `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payment Received</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;background:#f6f8fb;margin:0;color:#222}
    .card{max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 6px 18px rgba(13,38,76,0.06)}
    .header{padding:20px 24px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(90deg, ${primary} 0%, ${secondary} 100%);color:#fff}
    .brand{display:flex;align-items:center;gap:12px}
    .brand img{height:34px;border-radius:4px}
    .summary{padding:24px}
    .greeting{font-size:16px;margin:0 0 8px}
    .lead{color:#555;margin:0 0 18px;line-height:1.45}
    .meta{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
    .meta .item{background:#f4fbfd;border-left:4px solid ${accent};padding:10px 12px;border-radius:6px;font-size:13px;color:#034047}
    table.items{width:100%;border-collapse:collapse;margin-top:8px}
    table.items th,table.items td{padding:12px 10px;border-bottom:1px solid #eef2f7;font-size:14px;text-align:left}
    .total{display:flex;justify-content:flex-end;gap:16px;align-items:center;margin-top:16px}
    .amount{font-size:20px;font-weight:700;color:${primary}}
    .cta{padding:22px 24px 30px}
    .btn{display:inline-block;background:${primary};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600}
    .foot{padding:18px 24px;font-size:13px;color:#8a96a3;background:#fbfdff;text-align:center}
    @media (max-width:480px){.header,.summary,.cta,.foot{padding-left:16px;padding-right:16px}}
  </style>
  </head><body>
    <div class="card" role="article" aria-labelledby="title">
      <div class="header">
        <a class="brand" href="${process.env.APP_BASE_URL || '#'}">
          ${logoUrl ? `<img src="${logoUrl}" alt="logo">` : ''}
          <div style="font-weight:700;font-size:16px">AskMeDirect</div>
        </a>
        <div style="text-align:right">
          <div style="font-size:12px;opacity:0.95">Invoice</div>
          <div style="font-weight:700;font-size:16px">${invoiceNumber || '—'}</div>
        </div>
      </div>

      <div class="summary">
        <p class="greeting">Hello ${escapeHtml(askerName) || 'Customer'},</p>
        <p class="lead">We received your payment. Details of the transaction are shown below.</p>

        <div class="meta" role="navigation">
          <div class="item"><strong>Date:</strong> ${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</div>
          <div class="item"><strong>Question:</strong> ${escapeHtml(questionTitle || '—')}</div>
        </div>

        <table class="items" role="table" aria-label="Invoice items">
          <thead>
            <tr><th>Description</th><th style="width:140px;text-align:right">Amount (USD)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Question: ${escapeHtml(questionTitle || '—')}</td>
              <td style="text-align:right">${formatUSD(subtotalUSD)}</td>
            </tr>
          </tbody>
        </table>

        <div class="total">
          <div style="text-align:right">
            <div style="color:#6b7280;font-size:13px">Total received</div>
            <div class="amount">${formatUSD(subtotalUSD)}</div>
          </div>
        </div>
      </div>

      <div class="cta">
        <a class="btn" href="${invoiceUrl || '#'}" target="_blank" rel="noopener">View invoice</a>
      </div>

      <div class="foot">
        Need help? Contact <a href="mailto:${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}">${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}</a>.
      </div>
    </div>
  </body></html>`;
}

export function payoutPendingTemplate({ logoUrl, proName, invoiceNumber, invoiceDate, questionTitle, payoutAmountUSD, invoiceUrl, supportEmail }) {
  const primary = "#0070F3";
  const accent = "#00B5D8";
  const secondary = "#6C63FF";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payout Pending</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;background:#f6f8fb;margin:0;color:#222}
      .card{max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 6px 18px rgba(13,38,76,0.06)}
      .header{padding:18px 22px;background:linear-gradient(90deg, ${secondary}, ${primary});color:#fff;display:flex;align-items:center;justify-content:space-between}
      .brand{display:flex;align-items:center;gap:10px}
      .brand img{height:32px;border-radius:4px}
      .summary{padding:22px}
      .title{font-size:16px;margin:0 0 8px}
      .lead{color:#4b5563;margin:0 0 18px}
      table{width:100%;border-collapse:collapse}
      td, th{padding:10px;border-bottom:1px solid #eef2f7;font-size:14px}
      .amount{font-weight:700;color:${primary};font-size:18px}
      .btn{display:inline-block;background:${accent};color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600}
      .foot{padding:16px;background:#fbfdff;text-align:center;color:#8a96a3;font-size:13px}
      @media (max-width:480px){ .header,.summary,.foot{padding-left:16px;padding-right:16px}}
    </style>
  </head><body>
    <div class="card">
      <div class="header">
        <a href="${process.env.APP_BASE_URL || '#'}" class="brand">
          ${logoUrl ? `<img src="${logoUrl}" alt="logo">` : ''}
          <strong>AskMeDirect</strong>
        </a>
        <div style="text-align:right">
          <div style="font-size:12px">Pending Payout</div>
          <div style="font-weight:700">${invoiceNumber || '—'}</div>
        </div>
      </div>

      <div class="summary">
        <p class="title">Hi ${escapeHtml(proName) || 'Professional'},</p>
        <p class="lead">A payout for the question below could not be sent immediately and has been recorded as pending. We'll attempt transfer again once your Stripe account is ready.</p>

        <table>
          <tr><th style="text-align:left">Question</th><td style="text-align:right">${escapeHtml(questionTitle || '—')}</td></tr>
          <tr><th style="text-align:left">Amount pending</th><td style="text-align:right" class="amount">${formatUSD(payoutAmountUSD)}</td></tr>
          <tr><th style="text-align:left">Date</th><td style="text-align:right">${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</td></tr>
        </table>

        <div style="margin-top:18px;text-align:center">
          <a class="btn" href="${invoiceUrl || '#'}" target="_blank" rel="noopener">View pending payout</a>
        </div>
      </div>

      <div class="foot">Questions? <a href="mailto:${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}">${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}</a></div>
    </div>
  </body></html>`;
}

export function payoutSentTemplate({ logoUrl, proName, invoiceNumber, invoiceDate, questionTitle, payoutAmountUSD, transferId, invoiceUrl, supportEmail }) {
  const primary = "#0070F3";
  const secondary = "#6C63FF";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Payout Sent</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial;background:#f6f8fb;margin:0;color:#222}
      .card{max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 6px 18px rgba(13,38,76,0.06)}
      .header{padding:18px 22px;background:linear-gradient(90deg, ${primary}, ${secondary});color:#fff;display:flex;align-items:center;justify-content:space-between}
      .brand img{height:32px;border-radius:4px}
      .summary{padding:22px}
      .lead{color:#4b5563}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      td,th{padding:10px;border-bottom:1px solid #eef2f7;font-size:14px}
      .amount{font-weight:700;color:${primary};font-size:18px}
      .details{margin-top:14px;color:#6b7280;font-size:13px}
      .btn{display:inline-block;background:${secondary};color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600}
      .foot{padding:16px;background:#fbfdff;text-align:center;color:#8a96a3;font-size:13px}
      @media (max-width:480px){ .header,.summary,.foot{padding-left:16px;padding-right:16px}}
    </style>
  </head><body>
    <div class="card">
      <div class="header">
        <a href="${process.env.APP_BASE_URL || '#'}" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff">
          ${logoUrl ? `<img src="${logoUrl}" alt="logo">` : ''}
          <strong>AskMeDirect</strong>
        </a>
        <div style="text-align:right">
          <div style="font-size:12px">Payout Sent</div>
          <div style="font-weight:700">${invoiceNumber || '—'}</div>
        </div>
      </div>

      <div class="summary">
        <p style="margin:0 0 8px 0;font-size:16px">Hello ${escapeHtml(proName) || 'Professional'},</p>
        <p class="lead">Your payout for the question below has been processed.</p>

        <table>
          <tr><th style="text-align:left">Question</th><td style="text-align:right">${escapeHtml(questionTitle || '—')}</td></tr>
          <tr><th style="text-align:left">Amount paid</th><td style="text-align:right" class="amount">${formatUSD(payoutAmountUSD)}</td></tr>
          <tr><th style="text-align:left">Transfer ID</th><td style="text-align:right">${escapeHtml(transferId || '—')}</td></tr>
          <tr><th style="text-align:left">Date</th><td style="text-align:right">${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</td></tr>
        </table>

        <p class="details">You can view the official invoice and history by clicking the button below.</p>

        <div style="margin-top:14px;text-align:center">
          <a class="btn" href="${invoiceUrl || '#'}" target="_blank" rel="noopener">View payout invoice</a>
        </div>
      </div>

      <div class="foot">If you have questions contact <a href="mailto:${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}">${escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'support@askmedirect.com')}</a></div>
    </div>
  </body></html>`;
}

// small helpers used by templates
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
export function formatUSD(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}