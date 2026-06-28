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

// EMAIL_SKIP_CONFIG — set a recipient key to true to suppress that email.
// Callers can override per-call by passing enabled: false (or enabled: true to force).
const EMAIL_SKIP_CONFIG = {
  approved:         { professional: true  },  // pro approved it themselves, no need to notify
  awaiting_payment: { professional: true  },  // pro doesn't need a "payment pending" nudge
  // submitted:     { asker: false },         // example: un-comment to re-enable
};

function shouldSkipEmail(status, recipientType) {
  return EMAIL_SKIP_CONFIG[status]?.[recipientType] === true;
}

export const sendQuestionStatusEmail = async (options) => {
  const {
    recipientType,
    status,
    question,
    recipient,
    customMessage,
    actionUrl,
    enabled,  // pass true to force-send, false to force-skip, omit to use EMAIL_SKIP_CONFIG
  } = options;

  if (!recipient || !recipient.email) {
    console.error("Cannot send email: recipient email missing");
    return;
  }

  if (enabled === false) {
    console.log(`[Email] force-skipped — status: ${status}, recipient: ${recipientType}`);
    return;
  }

  if (enabled !== true && shouldSkipEmail(status, recipientType)) {
    console.log(`[Email] skipped by config — status: ${status}, recipient: ${recipientType}`);
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
          <p style="margin: 0; font-weight: bold;">Question: ${escapeHtml(stripHtml(question.title))}</p>
          ${question.price ? `<p style="margin: 5px 0 0 0;">Paid: $${question.price}</p>` : ""}
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
          process.env.SUPPORT_EMAIL || "admin@askmedirect.com"
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


export function paymentReceivedTemplate({ logoUrl, askerName, invoiceNumber, invoiceDate, questionTitle: _qtr, subtotalUSD, invoiceUrl, supportEmail }) {
  const questionTitle = stripHtml(_qtr);
  const support = escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'admin@askmedirect.com');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Received - AskMeDirect</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0070F3 0%,#6C63FF 100%);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 32px 18px;">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AskMeDirect</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px;">Professional answers, on demand</div>
          </td>
          <td align="right" style="padding:28px 32px 18px;">
            <div style="background:rgba(255,255,255,0.18);border-radius:8px;padding:10px 16px;text-align:center;">
              <div style="font-size:10px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.2px;">Invoice</div>
              <div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:3px;">${invoiceNumber || '—'}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0 32px 0;">
            <div style="background:rgba(255,255,255,0.12);border-radius:6px 6px 0 0;padding:9px 16px;display:inline-block;">
              <span style="font-size:13px;color:#fff;font-weight:600;">&#10003; &nbsp;Payment Confirmed</span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:19px;font-weight:700;color:#1a202c;">Hello ${escapeHtml(askerName) || 'Customer'},</p>
      <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;">Thank you for your payment. Your transaction has been processed successfully and is confirmed below.</p>

      <!-- META PILLS -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td width="49%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Date</div>
            <div style="font-size:14px;color:#1a202c;font-weight:600;margin-top:5px;">${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</div>
          </td>
          <td width="2%"></td>
          <td width="49%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Status</div>
            <div style="font-size:14px;color:#16a34a;font-weight:700;margin-top:5px;">&#10003; Paid</div>
          </td>
        </tr>
      </table>

      <!-- LINE ITEMS -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#f8fafc;">
          <th align="left" style="padding:11px 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:1px solid #e2e8f0;">Description</th>
          <th align="right" style="padding:11px 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:1px solid #e2e8f0;">Amount (USD)</th>
        </tr>
        <tr>
          <td style="padding:16px;font-size:14px;color:#374151;border-bottom:1px solid #f1f5f9;">${escapeHtml(questionTitle || '—')}</td>
          <td align="right" style="padding:16px;font-size:14px;color:#374151;border-bottom:1px solid #f1f5f9;">${formatUSD(subtotalUSD)}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:15px 16px;font-size:14px;font-weight:700;color:#1a202c;">Total Received</td>
          <td align="right" style="padding:15px 16px;">
            <span style="font-size:22px;font-weight:800;color:#0070F3;">${formatUSD(subtotalUSD)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:28px 32px 32px;" align="center">
      <a href="${invoiceUrl || '#'}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#0070F3,#6C63FF);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 44px;border-radius:8px;">
        View Invoice &rarr;
      </a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Need help? <a href="mailto:${support}" style="color:#0070F3;text-decoration:none;">${support}</a> &nbsp;&middot;&nbsp; AskMeDirect</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function payoutPendingTemplate({ logoUrl, proName, invoiceNumber, invoiceDate, questionTitle: _qtp, payoutAmountUSD, invoiceUrl, supportEmail }) {
  const questionTitle = stripHtml(_qtp);
  const support = escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'admin@askmedirect.com');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payout Pending - AskMeDirect</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#d97706 0%,#ef4444 100%);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 32px 18px;">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AskMeDirect</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px;">Professional answers, on demand</div>
          </td>
          <td align="right" style="padding:28px 32px 18px;">
            <div style="background:rgba(255,255,255,0.18);border-radius:8px;padding:10px 16px;text-align:center;">
              <div style="font-size:10px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.2px;">Reference</div>
              <div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:3px;">${invoiceNumber || '—'}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0 32px 0;">
            <div style="background:rgba(255,255,255,0.12);border-radius:6px 6px 0 0;padding:9px 16px;display:inline-block;">
              <span style="font-size:13px;color:#fff;font-weight:600;">&#9200; &nbsp;Payout Pending</span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:19px;font-weight:700;color:#1a202c;">Hi ${escapeHtml(proName) || 'Professional'},</p>
      <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;">A payout for the question below could not be sent immediately and has been recorded as <strong style="color:#d97706;">pending</strong>. We will attempt the transfer again once your Stripe account is ready.</p>

      <!-- DETAILS TABLE -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#fffbeb;">
          <td style="padding:13px 16px;font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #fde68a;" colspan="2">Payout Details</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;font-weight:600;color:#64748b;width:40%;border-bottom:1px solid #f1f5f9;">Question</td>
          <td align="right" style="padding:14px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;">${escapeHtml(questionTitle || '—')}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #f1f5f9;">Date</td>
          <td align="right" style="padding:14px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;">${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:16px;font-size:14px;font-weight:700;color:#1a202c;">Amount Pending</td>
          <td align="right" style="padding:16px;">
            <span style="font-size:22px;font-weight:800;color:#d97706;">${formatUSD(payoutAmountUSD)}</span>
          </td>
        </tr>
      </table>

      <!-- INFO BOX -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;margin-bottom:8px;">
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;"><strong>What happens next?</strong> Ensure your Stripe account is fully verified and able to receive transfers. We will automatically retry the payout once everything is in order.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:28px 32px 32px;" align="center">
      <a href="${invoiceUrl || '#'}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#d97706,#ef4444);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 44px;border-radius:8px;">
        View Pending Payout &rarr;
      </a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Questions? <a href="mailto:${support}" style="color:#0070F3;text-decoration:none;">${support}</a> &nbsp;&middot;&nbsp; AskMeDirect</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

export function payoutSentTemplate({ logoUrl, proName, invoiceNumber, invoiceDate, questionTitle: _qts, payoutAmountUSD, transferId, invoiceUrl, supportEmail }) {
  const questionTitle = stripHtml(_qts);
  const support = escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || 'admin@askmedirect.com');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payout Sent - AskMeDirect</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#059669 0%,#0070F3 100%);padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:28px 32px 18px;">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AskMeDirect</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:3px;">Professional answers, on demand</div>
          </td>
          <td align="right" style="padding:28px 32px 18px;">
            <div style="background:rgba(255,255,255,0.18);border-radius:8px;padding:10px 16px;text-align:center;">
              <div style="font-size:10px;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:1.2px;">Reference</div>
              <div style="font-size:14px;font-weight:700;color:#ffffff;margin-top:3px;">${invoiceNumber || '—'}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0 32px 0;">
            <div style="background:rgba(255,255,255,0.12);border-radius:6px 6px 0 0;padding:9px 16px;display:inline-block;">
              <span style="font-size:13px;color:#fff;font-weight:600;">&#10003; &nbsp;Payout Sent</span>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:19px;font-weight:700;color:#1a202c;">Hello ${escapeHtml(proName) || 'Professional'},</p>
      <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;">Great news — your payout has been <strong style="color:#059669;">successfully processed</strong> and is on its way to your Stripe account.</p>

      <!-- DETAILS TABLE -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#f0fdf4;">
          <td style="padding:13px 16px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #bbf7d0;" colspan="2">Payout Details</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;font-weight:600;color:#64748b;width:40%;border-bottom:1px solid #f1f5f9;">Question</td>
          <td align="right" style="padding:14px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;">${escapeHtml(questionTitle || '—')}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #f1f5f9;">Transfer ID</td>
          <td align="right" style="padding:14px 16px;font-size:12px;color:#374151;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(transferId || '—')}</td>
        </tr>
        <tr>
          <td style="padding:14px 16px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #f1f5f9;">Date</td>
          <td align="right" style="padding:14px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;">${escapeHtml(invoiceDate || new Date().toLocaleDateString())}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:16px;font-size:14px;font-weight:700;color:#1a202c;">Amount Paid</td>
          <td align="right" style="padding:16px;">
            <span style="font-size:22px;font-weight:800;color:#059669;">${formatUSD(payoutAmountUSD)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:28px 32px 32px;" align="center">
      <a href="${invoiceUrl || '#'}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#059669,#0070F3);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 44px;border-radius:8px;">
        View Payout Invoice &rarr;
      </a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Questions? <a href="mailto:${support}" style="color:#0070F3;text-decoration:none;">${support}</a> &nbsp;&middot;&nbsp; AskMeDirect</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
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

export function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
export function formatUSD(n) {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
}

export function welcomeEmailTemplate({ firstName, role, supportEmail }) {
  const support = escapeHtml(supportEmail || process.env.SUPPORT_EMAIL || "admin@askmedirect.com");
  const baseUrl = process.env.FRONTEND_URL || "#";
  const isPro = role === "professional";

  const ctaLabel = isPro ? "Complete Your Profile" : "Browse Professionals";
  const ctaUrl   = isPro ? `${baseUrl}/dashboard` : `${baseUrl}`;
  const headerTag = isPro ? "Professional Account" : "Asker Account";

  const stepsHtml = isPro
    ? `
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">1</span>
        <strong>Complete your profile</strong> — add your bio, expertise, and a photo so askers can trust you at a glance.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">2</span>
        <strong>Set your price range</strong> — define what you charge so askers know what to expect before submitting.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">3</span>
        <strong>Link your LinkedIn</strong> — earn a verified badge and boost your credibility with askers instantly.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">4</span>
        <strong>Start receiving questions</strong> — approve, quote, or decline requests all from your dashboard.
      </td></tr>`
    : `
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">1</span>
        <strong>Browse professionals</strong> — filter by expertise, language, location, and price range to find the right fit.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">2</span>
        <strong>Write your question</strong> — be as specific as you need. The more context you share, the better the answer.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">3</span>
        <strong>Set your price or request a quote</strong> — pay what you're comfortable with, or let the professional suggest a rate.
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
        <span style="display:inline-block;width:22px;height:22px;background:#0070F3;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:22px;margin-right:10px;vertical-align:middle;">4</span>
        <strong>Get a private, thoughtful answer</strong> — all responses are confidential and delivered directly to you.
      </td></tr>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome to AskMeDirect</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#0070F3 0%,#6C63FF 100%);padding:36px 32px 28px;text-align:center;">
      <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AskMeDirect</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;letter-spacing:0.5px;">Professional answers, on demand</div>
      <div style="margin-top:18px;display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:5px 16px;">
        <span style="font-size:12px;color:#fff;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(headerTag)}</span>
      </div>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:32px 32px 0;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#1a202c;">Welcome aboard, ${escapeHtml(firstName) || "there"}! &#127881;</p>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.7;">
        ${isPro
          ? "Your professional account on AskMeDirect is ready. People with real questions are looking for experts like you — let's get your profile set up so they can find you."
          : "Your AskMeDirect account is ready. Skip the endless Googling — get clear, private answers from vetted professionals who've actually been there."}
      </p>
    </td>
  </tr>

  <!-- WHAT'S NEXT -->
  <tr>
    <td style="padding:0 32px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 22px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#0070F3;text-transform:uppercase;letter-spacing:1px;">What to do next</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${stepsHtml}
        </table>
      </div>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:28px 32px;" align="center">
      <a href="${ctaUrl}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#0070F3,#6C63FF);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 44px;border-radius:8px;">
        ${escapeHtml(ctaLabel)} &rarr;
      </a>
    </td>
  </tr>

  <!-- SPAM NOTICE -->
  <tr>
    <td style="padding:0 32px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              <strong>&#9993; Keep our emails out of spam</strong> — please add
              <strong>${support}</strong> to your contacts or mark it as
              <em>Not Spam</em> if it lands in your junk folder. We'll use this
              address to send you important notifications and updates.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        Need help? <a href="mailto:${support}" style="color:#0070F3;text-decoration:none;">${support}</a>
        &nbsp;&middot;&nbsp; AskMeDirect &nbsp;&middot;&nbsp;
        <a href="${baseUrl}" style="color:#0070F3;text-decoration:none;">askmedirect.com</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}