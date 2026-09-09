import { createLogger, NotificationStatus } from '@bses/shared';

const logger = createLogger({ service: 'notification' });

export class WhatsappService {
  public async sendWhatsApp(recipient: string, message: string): Promise<NotificationStatus> {
    const masked = recipient.length > 4 ? `${recipient.slice(0, 4)}****` : '****';
    logger.debug(`WhatsApp (simulated) | to=${masked} | chars=${message.length}`);
    return NotificationStatus.SIMULATED;
  }
}
