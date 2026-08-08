import axios from 'axios';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'notification-client' });

const NOTIFICATION_SERVICE_URL = process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3013';

const client = axios.create({
  baseURL: NOTIFICATION_SERVICE_URL,
  timeout: 5000,
});

export class NotificationClient {
  public async sendSms(recipient: string, message: string): Promise<void> {
    try {
      await client.post('/api/notifications/sms', { recipient, message });
      logger.info('SMS notification dispatched', { recipient: recipient.substring(0, 4) + '****' });
    } catch (err: unknown) {
      logger.error('Failed to send SMS notification', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  public async sendWhatsApp(recipient: string, message: string): Promise<void> {
    try {
      await client.post('/api/notifications/whatsapp', { recipient, message });
      logger.info('WhatsApp notification dispatched', { recipient: recipient.substring(0, 4) + '****' });
    } catch (err: unknown) {
      logger.error('Failed to send WhatsApp notification', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  public async notifyApplicationSubmitted(mobile: string, applicationNumber: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been submitted successfully. Track status on the BSES portal.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyApplicationApproved(mobile: string, applicationNumber: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been APPROVED. Connection installation will be scheduled shortly.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyApplicationRejected(mobile: string, applicationNumber: string, reason?: string): Promise<void> {
    const message = `BSES: Your connection application ${applicationNumber} has been REJECTED.${reason ? ' Reason: ' + reason : ''} Please contact BSES support.`;
    await this.sendSms(mobile, message);
  }

  public async notifyDocumentsRequested(mobile: string, applicationNumber: string): Promise<void> {
    const message = `BSES: Additional documents are required for your application ${applicationNumber}. Please upload them on the BSES portal.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyApplicationAssigned(mobile: string, applicationNumber: string, officerName: string): Promise<void> {
    const message = `BSES: Your application ${applicationNumber} has been assigned to officer ${officerName} for verification.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyVerificationCompleted(mobile: string, applicationNumber: string): Promise<void> {
    const message = `BSES: Verification for application ${applicationNumber} is complete. It is now under final review.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyConnectionScheduled(mobile: string, applicationNumber: string, scheduledDate?: string): Promise<void> {
    const when = scheduledDate ? ` scheduled for ${scheduledDate}` : '';
    const message = `BSES: Your connection installation for application ${applicationNumber} has been${when}.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyConnectionCompleted(mobile: string, applicationNumber: string): Promise<void> {
    const message = `BSES: Your electricity connection for application ${applicationNumber} is now active. Thank you for choosing BSES.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  public async notifyProfileUpdated(mobile: string): Promise<void> {
    const message = `BSES: Your profile has been updated successfully. If you did not make this change, please contact support immediately.`;
    await this.sendSms(mobile, message);
  }
}

export const notificationClient = new NotificationClient();
