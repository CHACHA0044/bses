import { NotificationStatus } from '@bses/shared';

export interface SendWhatsAppResult {
  status: NotificationStatus;
  messageId: string;
  recipient: string;
}

export interface IWhatsAppProvider {
  sendWhatsApp(recipient: string, message: string): Promise<SendWhatsAppResult>;
}

import { createLogger } from '@bses/shared';
const logger = createLogger({ service: 'notification' });

export class MockWhatsAppProvider implements IWhatsAppProvider {
  public async sendWhatsApp(recipient: string, message: string): Promise<SendWhatsAppResult> {
    const messageId = `wa_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const masked = recipient.length > 4 ? `${recipient.slice(0, 4)}****` : '****';
    logger.info(`📧 WhatsApp (simulated) | to=${masked} | id=${messageId} | chars=${message.length}`);
    return {
      status: NotificationStatus.SIMULATED,
      messageId,
      recipient,
    };
  }
}
