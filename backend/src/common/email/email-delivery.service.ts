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
 * delivery was skipped. Authentication codes are delivered only by SMS.
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

  adminInvitation(
    to: string,
    input: { invitationUrl: string; role: 'Admin' | 'Super Admin'; expiresAt: Date },
  ) {
    const safeUrl = escapeHtml(input.invitationUrl);
    const expiry = new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Africa/Lagos',
    }).format(input.expiresAt);
    return this.send({
      to,
      subject: 'You have been invited to join SingleRent',
      text: [
        `You have been invited to join SingleRent as a ${input.role}.`,
        '',
        `Accept your invitation: ${input.invitationUrl}`,
        '',
        `This secure invitation expires on ${expiry} (Nigeria time). If you were not expecting it, you can ignore this email.`,
      ].join('\n'),
      html: `<main style="font-family:Arial,sans-serif;color:#163f35;max-width:560px;margin:0 auto;padding:24px"><h1 style="margin:0 0 16px">You are invited to SingleRent</h1><p>You have been invited to join SingleRent as a <strong>${input.role}</strong>.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1d6a4d;color:#fff;text-decoration:none;font-weight:700">Accept invitation</a></p><p>If the button does not open, copy this link into your browser:</p><p style="overflow-wrap:anywhere"><a href="${safeUrl}">${safeUrl}</a></p><p style="color:#61746b">This secure invitation expires on ${escapeHtml(expiry)} (Nigeria time). If you were not expecting it, you can ignore this email.</p></main>`,
    });
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

  private redact(email: string): string {
    const [local, domain] = email.split('@');
    return `${(local ?? 'unknown').slice(0, 2)}***@${domain ?? 'unknown'}`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
