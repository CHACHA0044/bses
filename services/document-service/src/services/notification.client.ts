import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-client' });

const NOTIFICATION_SERVICE_URL = process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3013';

const TIMEOUT_MS = 5000;

/**
 * Minimal fetch-based client for the notification service. The document
 * service only fires one notification shape (a document could not be read /
 * needs manual review at OCR time). `userId` is forwarded so the notification
 * service persists a row in `notification_logs`. Notification failures are
 * never allowed to fail the OCR job itself.
 */
export class NotificationClient {
  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${NOTIFICATION_SERVICE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(`Notification service returned ${res.status} for ${path}`);
      }
    } catch (err) {
      logger.error(`Failed to dispatch notification to ${path}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  public async sendSms(recipient: string, message: string, userId?: string): Promise<void> {
    await this.post('/api/notifications/sms', { recipient, message, ...(userId && { userId }) });
  }

  public async sendWhatsApp(recipient: string, message: string, userId?: string): Promise<void> {
    await this.post('/api/notifications/whatsapp', { recipient, message, ...(userId && { userId }) });
  }

  public async notifyDocumentVerificationPending(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Document verification pending for your application ${applicationNumber}. One or more documents could not be read or need review — please re-upload clearer copies on the BSES portal.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }
}

export const notificationClient = new NotificationClient();
