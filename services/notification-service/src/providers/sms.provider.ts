import { NotificationStatus } from '@bses/shared';

export interface SendSmsResult {
  status: NotificationStatus;
  messageId: string;
  recipient: string;
}

export interface ISmsProvider {
  sendSms(recipient: string, message: string): Promise<SendSmsResult>;
}

import { createLogger } from '@bses/shared';
const logger = createLogger({ service: 'mock-sms-provider' });

export class MockSmsProvider implements ISmsProvider {
  public async sendSms(recipient: string, message: string): Promise<SendSmsResult> {
    const messageId = `sms_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    logger.info(`[SMS DEV SIMULATOR] To: ${recipient} | MessageId: ${messageId} | Content: ${message}`);
    return {
      status: NotificationStatus.SIMULATED,
      messageId,
      recipient,
    };
  }
}
