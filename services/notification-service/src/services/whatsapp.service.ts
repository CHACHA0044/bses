import { createLogger, NotificationStatus } from '@bses/shared';

const logger = createLogger({ service: 'whatsapp-service' });

export class WhatsappService {
  /**
   * Simulates sending a WhatsApp message during development/testing as required by the SRS.
   */
  public async sendWhatsApp(recipient: string, message: string): Promise<NotificationStatus> {
    logger.info(`[WHATSAPP SIMULATION] To: ${recipient} | Message: ${message}`);
    return NotificationStatus.SIMULATED;
  }
}
