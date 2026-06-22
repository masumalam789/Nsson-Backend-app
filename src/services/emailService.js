"use strict";
const { BrevoClient, BrevoEnvironment } = require("@getbrevo/brevo");
const renderEmail = require("./renderEmail");

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
  environment: BrevoEnvironment.Production,
});

class EmailService {
  static async sendMail({ to, subject, template, data = {} }) {
    try {
      const html = await renderEmail(template, {
        ...data,
        companyName: "NSSON Auto Parts",
        supportPhone: "+91 97780 39977",
        supportEmail: "bpawan277@gmail.com",
        currentYear: new Date().getFullYear(),
        logoUrl:
          process.env.EMAIL_LOGO_URL ||
          "https://res.cloudinary.com/drwpv7ret/image/upload/v1782057435/Airbrush-IMAGE-ENHANCER-1773752342516-1773752342517_1_ho8tt6.png",
      });

      const result = await brevo.transactionalEmails.sendTransacEmail({
        sender: { email: "bpawan277@gmail.com", name: "NSSON Auto Parts" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      });

      console.log(`✅ Email sent to ${to} | ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("❌ Email sending failed:", error.message);
      return { success: false, error: error.message };
    }
  }

  static async sendRegistrationReceivedEmail(user) {
    return this.sendMail({
      to: user.email,
      subject: "Registration Received - NSSON Auto Parts",
      template: "registration-received",
      data: {
        firstName: user.firstName,
        shopName: user?.shopDetails?.shopName,
      },
    });
  }

  static async sendAccountApprovedEmail(user) {
    return this.sendMail({
      to: user.email,
      subject: "Your NSSON Auto Parts Account Has Been Approved",
      template: "account-approved",
      data: { firstName: user.firstName },
    });
  }

  static async sendAccountRejectedEmail(user) {
    return this.sendMail({
      to: user.email,
      subject: "Update Regarding Your Registration",
      template: "account-rejected",
      data: { firstName: user.firstName },
    });
  }

  static async sendForgotPasswordEmail(user, resetToken) {
    console.log("-----USER----", user);
    console.log("-----RESET----", resetToken);
    return this.sendMail({
      to: user.email,
      subject: "Reset Your Password",
      template: "forgot-password",
      data: {
        firstName: user.firstName,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password/${resetToken}`,
      },
    });
  }

  static async sendOrderConfirmedEmail(user, order) {
    return this.sendMail({
      to: user.email,
      subject: "Your Order Has Been Confirmed - NSSON Auto Parts",
      template: "order-confirmed",
      data: {
        customerName: user.firstName,
        orderNumber: order.orderNumber || order._id,
        totalAmount: order.total,
        paymentMethod: order.paymentMethod,
      },
    });
  }
}

module.exports = EmailService;
