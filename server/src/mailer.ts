import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(msg: MailMessage): Promise<void>;
}

export const noopMailer: Mailer = {
  enabled: false,
  async send() {},
};

export function createMailer(smtpUrl: string | null, from: string | null): Mailer {
  if (!smtpUrl || !from) return noopMailer;
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    enabled: true,
    async send(msg) {
      await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text });
    },
  };
}
