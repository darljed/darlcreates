import nodemailer, { type Transporter } from "nodemailer";

/**
 * Order email notifications. Degrades gracefully: if SMTP isn't configured,
 * logs to the server console (dev) instead of throwing. Never blocks a mutation.
 */
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASSWORD;
const from = process.env.EMAIL_FROM ?? "Darl Creates <no-reply@darlcreates.local>";

function isEmailConfigured() {
  return Boolean(host && smtpUser && smtpPass);
}

let _transport: Transporter | null = null;
function transport() {
  _transport ??= nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  return _transport;
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (!isEmailConfigured()) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  try {
    await transport().sendMail({ from, to, subject, text });
  } catch (err) {
    // Notifications are best-effort; never fail the order mutation.
    console.error("[email] send failed:", err);
  }
}

export const orderEmails = {
  placed: (orderNo: string, totalPhp: string) => ({
    subject: `Order ${orderNo} received`,
    text: `Thanks! We received your order ${orderNo} (${totalPhp}). Please complete GCash payment and submit your reference number so we can start printing.`,
  }),
  paymentVerified: (orderNo: string) => ({
    subject: `Payment verified for ${orderNo}`,
    text: `Your payment for order ${orderNo} is verified. We're starting production — you'll get another update when it ships.`,
  }),
  paymentRejected: (orderNo: string, reason: string) => ({
    subject: `Payment issue for ${orderNo}`,
    text: `We couldn't verify the payment for order ${orderNo}: ${reason}. Please re-check and submit your GCash reference again.`,
  }),
  shipped: (orderNo: string, carrier: string, tracking: string) => ({
    subject: `Order ${orderNo} shipped`,
    text: `Your order ${orderNo} is on the way via ${carrier}. Tracking: ${tracking}.`,
  }),
};
