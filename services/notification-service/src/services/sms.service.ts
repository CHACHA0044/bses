import { createLogger, NotificationStatus } from '@bses/shared';

const logger = createLogger({ service: 'sms-service' });

export class SmsService {
  /**
   * Simulates sending an SMS message during development/testing as required by the SRS.
   */
  public async sendSms(recipient: string, message: string): Promise<NotificationStatus> {
    logger.info(`[SMS SIMULATION] To: ${recipient} | Message: ${message}`);
    return NotificationStatus.SIMULATED;
  }
}
