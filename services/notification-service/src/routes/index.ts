import { Router } from 'express';
import { ProviderFactory } from '../providers/provider.factory';
import { sendSuccess } from '@bses/shared';

const router = Router();

router.post('/sms', async (req, res, next) => {
  try {
    const { recipient, message } = req.body as { recipient: string; message: string };
    const provider = ProviderFactory.getSmsProvider();
    const result = await provider.sendSms(recipient, message);
    sendSuccess(res, result, 'SMS notification dispatched');
  } catch (err) {
    next(err);
  }
});

router.post('/whatsapp', async (req, res, next) => {
  try {
    const { recipient, message } = req.body as { recipient: string; message: string };
    const provider = ProviderFactory.getWhatsAppProvider();
    const result = await provider.sendWhatsApp(recipient, message);
    sendSuccess(res, result, 'WhatsApp notification dispatched');
  } catch (err) {
    next(err);
  }
});

export default router;
