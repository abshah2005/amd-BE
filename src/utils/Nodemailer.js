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



export const sendQuestionStatusEmail = async (options) => {
  const { recipientType, status, question, recipient, customMessage, actionUrl } = options;
  
  if (!recipient || !recipient.email) {
    console.error("Cannot send email: recipient email missing");
    return;
  }

  // Get other party's name
  const otherParty = recipientType === "asker" 
    ? `${question.professional?.firstName || ''} ${question.professional?.lastName || ''}`.trim()
    : `${question.asker?.firstName || ''} ${question.asker?.lastName || ''}`.trim();
    
  // Default action URL points to question detail page
  const questionLink = `${process.env.FRONTEND_URL}/questions`;
  
  // Configure email details based on status and recipient
  const emailConfig = getEmailConfigByStatus(status, recipientType, question, otherParty, customMessage);
  
  if (!emailConfig) {
    console.log(`No email configuration for status: ${status} and recipient: ${recipientType}`);
    return;
  }
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">${emailConfig.title}</h2>
      </div>
      
      <div style="color: #555; line-height: 1.5;">
        <p>Hello ${recipient.firstName || 'there'},</p>
        
        <p>${emailConfig.message}</p>
        
        ${customMessage ? `<p>${customMessage}</p>` : ''}
        
        <div style="margin: 25px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #007bff; border-radius: 3px;">
          <p style="margin: 0; font-weight: bold;">Question: ${question.title}</p>
          ${question.price ? `<p style="margin: 5px 0 0 0;">Budget: $${question.price}</p>` : ''}
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
        <p>If you have any questions, please contact our support team at ${process.env.SUPPORT_EMAIL || 'support@askmedirect.com'}</p>
      </div>
    </div>
  `;
  
  await sendEmail(
    recipient.email,
    emailConfig.subject,
    html
  );
};

/**
 * Get email configuration based on question status and recipient type
 */
function getEmailConfigByStatus(status, recipientType, question, otherParty, customMessage) {
  // Default values
  const configs = {
    submitted: {
      asker: {
        subject: "Your Question Has Been Submitted",
        title: "Question Submitted Successfully",
        message: `Your question has been sent to ${otherParty}. They'll review it soon.`,
        buttonText: "View Your Question"
      },
      professional: {
        subject: "New Question Received",
        title: "You Have a New Question",
        message: `${otherParty} has submitted a new question for you to review.`,
        buttonText: "Review Question"
      }
    },
    
    approved: {
      asker: {
        subject: "Your Question Has Been Approved",
        title: "Question Approved",
        message: `Great news! ${otherParty} has approved your question and will provide an answer soon.`,
        buttonText: "View Status"
      },
      professional: {
        subject: "Question Approved",
        title: "Question Approved",
        message: "You've approved this question. Please provide a quote or answer soon.",
        buttonText: "Provide Quote"
      }
    },
    
    rejected: {
      asker: {
        subject: "Your Question Has Been Declined",
        title: "Question Not Accepted",
        message: `${otherParty} was unable to accept your question at this time.`,
        buttonText: "View Details"
      },
      professional: {
        subject: "Question Rejected",
        title: "Question Rejected",
        message: "You've declined to answer this question.",
        buttonText: "View Details"
      }
    },
    
    quoted: {
      asker: {
        subject: "Quote Available for Your Question",
        title: "Your Question Has Been Quoted",
        message: `${otherParty} has provided a quote for your question. Please review and proceed with payment if you'd like to receive an answer.`,
        buttonText: "Review Quote"
      },
      professional: {
        subject: "Quote Sent",
        title: "Quote Sent Successfully",
        message: "Your quote has been sent to the asker. We'll notify you when they make a payment.",
        buttonText: "View Question"
      }
    },
    
    awaiting_payment: {
      asker: {
        subject: "Payment Required for Your Question",
        title: "Complete Your Payment",
        message: "Please complete the payment to receive your answer.",
        buttonText: "Make Payment"
      },
      professional: {
        subject: "Payment Pending for Question",
        title: "Payment Pending",
        message: "The asker has initiated payment for this question. You'll be notified once payment is complete.",
        buttonText: "View Question"
      }
    },
    
    paid: {
      asker: {
        subject: "Payment Confirmed - Awaiting Answer",
        title: "Payment Confirmed",
        message: `Thank you for your payment. ${otherParty} will provide an answer soon.`,
        buttonText: "View Question"
      },
      professional: {
        subject: "Payment Received - Answer Required",
        title: "Payment Received",
        message: `Payment has been received for this question. Please provide your answer${question.deliveryType === 'fast' ? ' with expedited delivery' : ''}.`,
        buttonText: "Answer Question"
      }
    },
    
    answered: {
      asker: {
        subject: "Your Question Has Been Answered!",
        title: "Answer Received",
        message: `${otherParty} has answered your question. You can review the answer and ask follow-up questions within the next 48 hours.`,
        buttonText: "View Answer"
      },
      professional: {
        subject: "Answer Submitted",
        title: "Answer Submitted",
        message: "Your answer has been submitted. The asker can now review it and may ask follow-up questions within 48 hours.",
        buttonText: "View Thread"
      }
    },
    
    in_thread: {
      asker: {
        subject: "Follow-up Response Needed",
        title: "Follow-up Question Sent",
        message: `Your follow-up question has been sent to ${otherParty}.`,
        buttonText: "View Conversation"
      },
      professional: {
        subject: "Follow-up Question Received",
        title: "New Follow-up Question",
        message: "The asker has sent a follow-up question. Please respond to continue the conversation.",
        buttonText: "View & Respond"
      }
    },
    
    closed: {
      asker: {
        subject: "Question Thread Closed",
        title: "Thread Closed",
        message: "This question thread has been closed. Please provide feedback on your experience.",
        buttonText: "Leave Feedback"
      },
      professional: {
        subject: "Thread Closed - Payment Processing",
        title: "Thread Closed",
        message: "You've closed this thread. Your payment is being processed.",
        buttonText: "View Details"
      }
    }
  };
  
  // Return the appropriate config or undefined if not found
  return configs[status]?.[recipientType];
}