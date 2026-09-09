import axios from 'axios';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'auth-notification-client' });

const NOTIFICATION_SERVICE_URL = process.env['NOTIFICATION_SERVICE_URL'] || 'http://localhost:3013';

const client = axios.create({
  baseURL: NOTIFICATION_SERVICE_URL,
  timeout: 5000,
});

export class NotificationClient {
  public async sendSms(recipient: string, message: string): Promise<void> {
    try {
      await client.post('/api/notifications/sms', { recipient, message });
      logger.info(`📧 SMS dispatched | to=${recipient.substring(0, 4)}****`);
    } catch (err: unknown) {
      logger.error(`❌ SMS dispatch failed | error=${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public async sendWhatsApp(recipient: string, message: string): Promise<void> {
    try {
      await client.post('/api/notifications/whatsapp', { recipient, message });
      logger.info(`📧 WhatsApp dispatched | to=${recipient.substring(0, 4)}****`);
    } catch (err: unknown) {
      logger.error(`❌ WhatsApp dispatch failed | error=${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Triggers SMS & WhatsApp notifications upon successful registration (SRS 4.7).
   */
  public async notifyRegistrationSuccess(mobile: string, username: string): Promise<void> {
    const message = `Welcome to BSES Consumer Portal! Your registration for username ${username} was successful. Access your dashboard anytime.`;
    await this.sendSms(mobile, message);
    await this.sendWhatsApp(mobile, message);
  }

  /**
   * Triggers SMS notification upon password change or reset (SRS 4.7).
   */
  public async notifyPasswordChanged(mobile: string): Promise<void> {
    const message = `BSES Alert: Your account password was changed successfully. If you did not initiate this change, contact BSES support immediately.`;
    await this.sendSms(mobile, message);
  }
}

export const notificationClient = new NotificationClient();
