import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); 

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    
    user: process.env.EMAIL_USER,
   
    pass:process.env.EMAIL_PASS
  },
});

export const sendEmail = async (to, subject, text) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
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
      }

   export const sendConfrimationEmail=async(to,order)=>{
     const mailOptions={
        from:"abdullah03350904415@gmail.com",
        to:to,
        subject:"Order Confirmation",
        html:generateEmailContent(order),
     }

     await transporter.sendMail(mailOptions);
   }
