import { Router } from 'express';
import { ProviderFactory } from '../providers/provider.factory';
import { NotificationType } from '@bses/shared';
import { sendSuccess } from '@bses/shared';
import { createLogger } from '@bses/shared';
import { getPrismaClient } from '../db/db.client';

const logger = createLogger({ service: 'notification-routes' });

const router = Router();

/**
 * Persists a delivered (or simulated) notification in `notification_logs` so
 * every notification attempt is auditable. `userId` is optional — when absent
 * (e.g. profile notifications where the subject is not tied to an app) the row
 * is skipped rather than dropped, since `notification_logs.userId` is a
 * mandatory FK. A failed insert must never fail the dispatch itself.
 */
const persistNotificationLog = async (userId: string | undefined, type: NotificationType, recipient: string, message: string, status: string): Promise<void> => {
  if (!userId) return;
  try {
    await getPrismaClient().notificationLog.create({
      data: { userId, type, recipient, message, status: status as any },
    });
  } catch (err) {
    logger.error('Failed to persist notification log', { error: err instanceof Error ? err.message : String(err) });
  }
};

router.post('/sms', async (req, res, next) => {
  try {
    const { recipient, message, userId } = req.body as { recipient: string; message: string; userId?: string };
    const provider = ProviderFactory.getSmsProvider();
    const result = await provider.sendSms(recipient, message);
    await persistNotificationLog(userId, NotificationType.SMS, result.recipient, message, result.status);
    sendSuccess(res, result, 'SMS notification dispatched');
  } catch (err) {
    next(err);
  }
});

router.post('/whatsapp', async (req, res, next) => {
  try {
    const { recipient, message, userId } = req.body as { recipient: string; message: string; userId?: string };
    const provider = ProviderFactory.getWhatsAppProvider();
    const result = await provider.sendWhatsApp(recipient, message);
    await persistNotificationLog(userId, NotificationType.WHATSAPP, result.recipient, message, result.status);
    sendSuccess(res, result, 'WhatsApp notification dispatched');
  } catch (err) {
    next(err);
  }
});

export default router;
