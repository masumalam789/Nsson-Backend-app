"use strict";

const nodemailer = require("nodemailer");
const renderEmail = require("./renderEmail");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

class EmailService {
  static async sendMail({ to, subject, template, data = {} }) {
    try {
      const html = await renderEmail(template, {
        ...data,
        companyName: "NSSON Auto Parts",
        supportPhone: "+91 97780 39977",
        supportEmail: "nssonautoparts@gmail.com",
        currentYear: new Date().getFullYear(),

        // fallback logo until signed URL is ready
        logoUrl:
          process.env.EMAIL_LOGO_URL ||
          "https://via.placeholder.com/180x80?text=NSSON",
      });

      const info = await transporter.sendMail({
        from: `"NSSON Auto Parts" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html,
      });

      console.log(`✅ Email sent to ${to} | ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error("❌ Email sending failed:", error.message);

      return {
        success: false,
        error: error.message,
      };
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
      data: {
        firstName: user.firstName,
      },
    });
  }

  static async sendAccountRejectedEmail(user) {
    return this.sendMail({
      to: user.email,
      subject: "Update Regarding Your Registration",
      template: "account-rejected",
      data: {
        firstName: user.firstName,
      },
    });
  }

  static async sendForgotPasswordEmail(user, resetToken) {
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
