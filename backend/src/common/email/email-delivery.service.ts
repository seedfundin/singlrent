import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * A deliberately small provider boundary. Resend is only contacted when it is
 * explicitly configured; local and review environments safely record why
 * delivery was skipped without ever returning a one-time code to production
 * clients or logs.
 */
@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(message: EmailMessage): Promise<{ delivered: boolean; providerId?: string }> {
    const provider = this.configService.get<'disabled' | 'resend'>('EMAIL_PROVIDER') ?? 'disabled';
    if (provider === 'disabled') {
      this.logger.warn(`Email delivery skipped because EMAIL_PROVIDER is disabled (recipient: ${this.redact(message.to)}).`);
      return { delivered: false };
    }

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('EMAIL_FROM');
    if (!apiKey || !from) {
      throw new ServiceUnavailableException('Email delivery is configured but the provider credentials or sender address are missing');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    }).catch((cause: unknown) => {
      throw new ServiceUnavailableException(cause instanceof Error ? `Email delivery could not reach its provider: ${cause.message}` : 'Email delivery could not reach its provider');
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      this.logger.error(`Email provider rejected delivery for ${this.redact(message.to)} with HTTP ${response.status}.`);
      throw new ServiceUnavailableException('Email delivery provider rejected the message');
    }
    const providerId = payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string' ? payload.id : undefined;
    return { delivered: true, providerId };
  }

  verificationCode(to: string, code: string) {
    return this.send(this.otpMessage(to, 'Verify your SingleRent email', 'Use this code to verify your SingleRent email address', code));
  }

  passwordResetCode(to: string, code: string) {
    return this.send(this.otpMessage(to, 'Reset your SingleRent password', 'Use this code to reset your SingleRent password', code));
  }

  notification(to: string, title: string, body: string) {
    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body);
    return this.send({
      to,
      subject: title,
      text: `${title}\n\n${body}`,
      html: `<main><h1>${safeTitle}</h1><p>${safeBody}</p></main>`,
    });
  }

  private otpMessage(to: string, subject: string, intro: string, code: string): EmailMessage {
    const safeIntro = escapeHtml(intro);
    return {
      to,
      subject,
      text: `${intro}: ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<main><h1>${safeIntro}</h1><p>Your one-time code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></main>`,
    };
  }

  private redact(email: string): string {
    const [local, domain] = email.split('@');
    return `${(local ?? 'unknown').slice(0, 2)}***@${domain ?? 'unknown'}`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
