import axios from 'axios';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-client' });

const NOTIFICATION_SERVICE_URL = process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3013';

const client = axios.create({
  baseURL: NOTIFICATION_SERVICE_URL,
  timeout: 5000,
});

/**
 * Lightweight client for the notification service. `userId` (when available)
 * is forwarded so the notification service can persist a row in
 * `notification_logs` for audit / DPDP traceability. The notification service
 * is service-to-service only and never exposed to the browser.
 */
export class NotificationClient {
  public async sendSms(recipient: string, message: string, userId?: string): Promise<void> {
    try {
      await client.post('/api/notifications/sms', { recipient, message, ...(userId && { userId }) });
      logger.info('SMS notification dispatched', { recipient: recipient.substring(0, 4) + '****' });
    } catch (err: unknown) {
      logger.error('Failed to send SMS notification', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  public async sendWhatsApp(recipient: string, message: string, userId?: string): Promise<void> {
    try {
      await client.post('/api/notifications/whatsapp', { recipient, message, ...(userId && { userId }) });
      logger.info('WhatsApp notification dispatched', { recipient: recipient.substring(0, 4) + '****' });
    } catch (err: unknown) {
      logger.error('Failed to send WhatsApp notification', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  public async notifyApplicationSubmitted(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been submitted successfully. Track status on the BSES portal.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyApplicationApproved(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been APPROVED. Connection installation will be scheduled shortly.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyApplicationRejected(mobile: string, applicationNumber: string, reason?: string, userId?: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been REJECTED.${reason ? ' Reason: ' + reason : ''} Please contact BSES support.`;
    await this.sendSms(mobile, message, userId);
  }

  public async notifyDocumentsRequested(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Document verification pending for your application ${applicationNumber}. Clearer or additional documents are required. Please upload them on the BSES portal.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyDocumentVerificationPending(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Document verification pending for your application ${applicationNumber}. One or more documents could not be read or need review — please re-upload clearer copies on the BSES portal.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyApplicationAssigned(mobile: string, applicationNumber: string, officerName: string, userId?: string): Promise<void> {
    const message = `BSES: Your application ${applicationNumber} has been assigned to officer ${officerName} for verification.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyVerificationCompleted(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Verification for application ${applicationNumber} is complete. It is now under final review.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyConnectionScheduled(mobile: string, applicationNumber: string, scheduledDate?: string, userId?: string): Promise<void> {
    const when = scheduledDate ? ` scheduled for ${scheduledDate}` : '';
    const message = `BSES: Your connection installation for application ${applicationNumber} has been${when}.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyConnectionCompleted(mobile: string, applicationNumber: string, userId?: string): Promise<void> {
    const message = `BSES: Your electricity connection for application ${applicationNumber} is now active. Thank you for choosing BSES.`;
    await this.sendSms(mobile, message, userId);
    await this.sendWhatsApp(mobile, message, userId);
  }

  public async notifyProfileUpdated(mobile: string, userId?: string): Promise<void> {
    const message = `BSES: Your profile has been updated successfully. If you did not make this change, please contact support immediately.`;
    await this.sendSms(mobile, message, userId);
  }
}

export const notificationClient = new NotificationClient();
