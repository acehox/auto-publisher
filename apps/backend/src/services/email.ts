import { env } from '@ap/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '#utils/logger.js';

/**
 * Outbound email — plain SMTP, one caller: the statutory withdrawal acknowledgement
 * (ZZP čl. 81.a st. 6). No queue, no templates, no provider SDK; keep it that way until a
 * second caller exists. Plain text only, so the durable-medium copy renders as sent.
 */

/** Failure a caller can distinguish from a bad address or a rejected recipient. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super('SMTP is not configured (SMTP_USER / SMTP_PASSWORD unset)');
    this.name = 'EmailNotConfiguredError';
  }
}

let transporter: Transporter | null = null;

const isConfigured = (): boolean => Boolean(env.SMTP_USER && env.SMTP_PASSWORD);

const ensureTransporter = (): Transporter => {
  if (!isConfigured()) throw new EmailNotConfiguredError();
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; anything else (587) negotiates STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    // Bounded: the withdrawal route awaits this send, so a hung SMTP conversation
    // must not hold the request open.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
};

/**
 * Sends one message and RESOLVES ONLY ON ACCEPTANCE — the caller stamps
 * `acknowledgedAt` off this promise, so never swallow a failure here.
 */
const send = async (message: { to: string; subject: string; text: string }): Promise<void> => {
  const info = await ensureTransporter().sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });

  // nodemailer resolves even when every recipient was refused: a rejected recipient
  // lands in `rejected`, not in a thrown error.
  if (info.rejected?.length) {
    throw new Error(`SMTP rejected recipient(s): ${info.rejected.join(', ')}`);
  }

  // Never log the recipient: the only mail this stack sends is the withdrawal
  // acknowledgement, so the address is a consumer's and the host log is not a
  // disclosed recipient of it. The message id is enough to trace a send.
  logger.info(`Sent email (${info.messageId})`);
};

export const Email = {
  send,
  isConfigured,
};
