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
const logger = createLogger({ service: 'mock-whatsapp-provider' });

export class MockWhatsAppProvider implements IWhatsAppProvider {
  public async sendWhatsApp(recipient: string, message: string): Promise<SendWhatsAppResult> {
    const messageId = `wa_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    logger.info(`[WHATSAPP DEV SIMULATOR] To: ${recipient} | MessageId: ${messageId} | Content: ${message}`);
    return {
      status: NotificationStatus.SIMULATED,
      messageId,
      recipient,
    };
  }
}
