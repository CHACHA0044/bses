import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';

vi.mock('../src/db/db.client', () => ({
  getPrismaClient: () => ({
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
  }),
}));

const app = createApp();

const VALID_SECRET = config.INTERNAL_SERVICE_SECRET;

describe('Notification internal-auth guard', () => {
  it('rejects dispatch without the x-internal-secret header', async () => {
    const res = await request(app).post('/api/notifications/sms').send({
      recipient: '+919999999999',
      message: 'spam',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong internal secret', async () => {
    const res = await request(app)
      .post('/api/notifications/sms')
      .set('x-internal-secret', 'not-the-shared-secret')
      .send({ recipient: '+919999999999', message: 'spam' });
    expect(res.status).toBe(401);
  });

  it('dispatches with a valid internal secret', async () => {
    const res = await request(app)
      .post('/api/notifications/sms')
      .set('x-internal-secret', VALID_SECRET)
      .send({ recipient: '+919999999999', message: 'hello', userId: 'user-1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('guards the whatsapp endpoint too', async () => {
    const denied = await request(app)
      .post('/api/notifications/whatsapp')
      .send({ recipient: '+919999999999', message: 'spam' });
    expect(denied.status).toBe(401);

    const allowed = await request(app)
      .post('/api/notifications/whatsapp')
      .set('x-internal-secret', VALID_SECRET)
      .send({ recipient: '+919999999999', message: 'hello' });
    expect(allowed.status).toBe(200);
  });
});