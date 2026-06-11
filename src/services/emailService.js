'use strict';

const nodemailer = require('nodemailer');

function getFrontendURL() {
  const rawURL = process.env.FRONTEND_URL || 'https://admin-garage3-ecommerencr.vercel.app';
  return rawURL.replace(/\/+$/, '');
}

function getDisplayName(user) {
  return user?.firstName || user?.name?.split(' ')[0] || 'Customer';
}

function getShopName(user) {
  return user?.shopDetails?.shopName || 'N/A';
}

function getSupportPhone() {
  return process.env.SUPPORT_PHONE || process.env.EMAIL_SUPPORT_PHONE || '';
}

function getSupportEmail() {
  return process.env.SUPPORT_EMAIL || process.env.EMAIL_SUPPORT_EMAIL || process.env.EMAIL_FROM || '';
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentYear() {
  return new Date().getFullYear();
}

function emailShell(title, bodyHTML) {
  const storeName = process.env.EMAIL_FROM_NAME || 'Team NSSON';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:28px 36px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${storeName}</h1>
    </div>
    <div style="padding:36px;">
      <h2 style="color:#1a1a2e;font-size:20px;margin:0 0 16px;">${title}</h2>
      ${bodyHTML}
    </div>
    <div style="background:#f7fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#a0aec0;font-size:12px;margin:0;">© ${currentYear()} ${storeName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function registrationReceivedHTML(user) {
  const name = escapeHTML(getDisplayName(user));
  const shopName = escapeHTML(getShopName(user));
  const email = escapeHTML(user.email || 'N/A');
  const phone = escapeHTML(user.phone || 'N/A');

  return emailShell(
    'Registration Received',
    `
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 12px;">Dear <strong>${name}</strong>,</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 18px;">Your retailer registration request has been received.</p>
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 18px;margin:0 0 22px;">
        <p style="color:#4a5568;font-size:14px;line-height:1.7;margin:0;"><strong>Shop Name:</strong> ${shopName}</p>
        <p style="color:#4a5568;font-size:14px;line-height:1.7;margin:0;"><strong>Email:</strong> ${email}</p>
        <p style="color:#4a5568;font-size:14px;line-height:1.7;margin:0;"><strong>Phone:</strong> ${phone}</p>
      </div>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 12px;">Our team will review your details and activate your account shortly.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 28px;">You will receive a confirmation email once approved.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0;">Regards,<br/>Team NSSON</p>
    `
  );
}

function accountApprovedHTML(user) {
  const name = escapeHTML(getDisplayName(user));
  const supportPhone = getSupportPhone();
  const supportEmail = getSupportEmail();
  const supportLine = escapeHTML([supportPhone, supportEmail].filter(Boolean).join(' | '));

  return emailShell(
    'Your NSSON Account is Active!',
    `
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 12px;">Dear <strong>${name}</strong>,</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 18px;">Your NSSON Autoparts Retailer Account is Active now.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 18px;">You can now browse products, check stock, and place orders 24×7.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 28px;">Thank you for choosing NSSON Autoparts. Happy Ordering!</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0;">Regards,<br/>Team NSSON${supportLine ? `<br/>${supportLine}` : ''}</p>
    `
  );
}

function accountRejectedHTML(user) {
  const name = escapeHTML(getDisplayName(user));

  return emailShell(
    'Registration Update',
    `
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 12px;">Dear <strong>${name}</strong>,</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 18px;">We were unable to approve your retailer account at this time.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 28px;">Please contact our support team for more information.</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0;">Regards,<br/>Team NSSON</p>
    `
  );
}

function forgotPasswordHTML(name, resetURL) {
  const storeName = process.env.EMAIL_FROM_NAME;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:28px 36px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${storeName}</h1>
    </div>
    <div style="padding:36px;">
      <h2 style="color:#1a1a2e;font-size:20px;margin:0 0 16px;">Reset Your Password</h2>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 12px;">Hi <strong>${name}</strong>,</p>
      <p style="color:#4a5568;font-size:15px;line-height:1.7;margin:0 0 28px;">
        We received a request to reset your password. Click the button below — this link is valid for <strong>1 hour</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${resetURL}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;">
          Reset My Password
        </a>
      </div>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 6px 6px 0;margin:0 0 24px;">
        <p style="color:#92400e;font-size:13px;margin:0;">
          ⚠️ <strong>Didn't request this?</strong> You can safely ignore this email.
        </p>
      </div>
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 18px;">
        <p style="color:#718096;font-size:12px;margin:0 0 6px;">Button not working? Copy this link:</p>
        <a href="${resetURL}" style="color:#4f46e5;font-size:12px;word-break:break-all;">${resetURL}</a>
      </div>
    </div>
    <div style="background:#f7fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#a0aec0;font-size:12px;margin:0;">© ${currentYear()} ${storeName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
class EmailService {
  static async sendMail({ user, subject, html }) {
    if (!user?.email) {
      return { success: false, error: 'Recipient email is required' };
    }

    try {
      const info = await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to: user.email,
        subject,
        html,
      });

      console.log(`✅ [EmailService] Email sent to ${user.email} | messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (error) {
      console.error(`❌ [EmailService] Failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  static async sendRegistrationReceivedEmail(user) {
    return EmailService.sendMail({
      user,
      subject: '[Team NSSON] Registration Received — Under Review',
      html: registrationReceivedHTML(user),
    });
  }

  static async sendAccountApprovedEmail(user) {
    return EmailService.sendMail({
      user,
      subject: 'Your NSSON Account is Active!',
      html: accountApprovedHTML(user),
    });
  }

  static async sendAccountRejectedEmail(user) {
    return EmailService.sendMail({
      user,
      subject: 'Team NSSON — Registration Update',
      html: accountRejectedHTML(user),
    });
  }

  static async sendForgotPasswordEmail(user, resetToken) {
    if (!user?.email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const name = getDisplayName(user);
    const resetURL = `${getFrontendURL()}/reset-password/${resetToken}`;

    try {
      const info = await transporter.sendMail({
        from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to:      user.email,
        subject: `Reset Your Password — ${process.env.EMAIL_FROM_NAME}`,
        html:    forgotPasswordHTML(name, resetURL),
      });

      console.log(`✅ [EmailService] Email sent to ${user.email} | messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };

    } catch (error) {
      console.error(`❌ [EmailService] Failed:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailService;
