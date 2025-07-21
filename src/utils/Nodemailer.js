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

const generateEmailContent = (order) => {
  const { userinfo, orders, total, paymentMethod, status } = order;

  const orderItems = orders
    .map(item => `
      <tr>
        <td><img src="${item.pic}" alt="${item.name}" style="width: 100px; height: auto;"></td>
        <td>${item.name}</td>
        <td>${item.price}</td>
        <td>${item.quantity}</td>
        <td>${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `)
    .join('');

  return `
    <h1>Order Confirmation</h1>
    <p>Dear ${userinfo.name},</p>
    <p>Thank you for your order! Here are the details:</p>
    <h2>Order Summary</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th>Product</th>
          <th>Name</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${orderItems}
      </tbody>
    </table>
    <p><strong>Order Total:</strong> $${total}</p>
    <p><strong>Payment Method:</strong> ${paymentMethod}</p>
    <p><strong>Status:</strong> ${status}</p>
    <h2>Shipping Address</h2>
    <p>${userinfo.name}<br>
    ${userinfo.address}</p>
  `;
};

export const sendConfrimationEmail = async (to, order) => {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM_EMAIL, // Use your verified sender
    subject: "Order Confirmation",
    html: generateEmailContent(order),
  };
  await sgMail.send(msg);
};