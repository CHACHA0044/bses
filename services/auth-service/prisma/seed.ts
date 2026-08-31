import 'dotenv/config';
import { PrismaClient, UserRole, Gender, ConsentType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

function getEncKey() {
  const hex = process.env['AES_SECRET_KEY'];
  if (!hex || hex.length !== 64) {
    return Buffer.alloc(32, 0);
  }
  return Buffer.from(hex, 'hex');
}

function getIv() {
  const hex = process.env['AES_IV'];
  if (!hex || hex.length !== 32) {
    return Buffer.alloc(16, 0);
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(value: string): string {
  const key = getEncKey();
  const iv = getIv();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let out = cipher.update(value, 'utf8', 'hex');
  out += cipher.final('hex');
  return out;
}

function hashSearchable(value: string): string {
  const key = getEncKey();
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
}

async function main() {
  console.log('Seeding BSES database records…');

  /* ── 1. Admin account ── */
  const adminEmail = 'admin@bsesdelhi.com';
  const adminHash = await bcrypt.hash('BsesAdmin@2026!', 12);
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash },
    create: {
      name: 'BSES System Administrator',
      email: adminEmail,
      passwordHash: adminHash,
      role: UserRole.ADMIN,
    },
  });
  console.log(`✓ Admin account ready: ${adminEmail} / BsesAdmin@2026!`);

  /* ── 2. Test consumer account (rajesh_sharma2026 / ConsumerPass@2026!) ── */
  const consumerUsername = 'rajesh_sharma2026';
  const consumerMobile   = '9876543210';
  const passwordHash     = await bcrypt.hash('ConsumerPass@2026!', 12);
  const mobileEncrypted  = encrypt(consumerMobile);
  const mobileHash       = hashSearchable(consumerMobile);

  const consumer = await prisma.user.upsert({
    where: { username: consumerUsername },
    update: {
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: 'ACTIVE',
    },
    create: {
      firstName:      'Rajesh',
      middleName:     'Kumar',
      lastName:       'Sharma',
      gender:         Gender.MALE,
      email:          'rajesh@bsesconsumer.test',
      username:       consumerUsername,
      passwordHash,
      mobileEncrypted,
      mobileHash,
      role:           UserRole.CONSUMER,
      status:         'ACTIVE',
    },
  });

  const existingConsent = await prisma.consentRecord.findFirst({
    where: { userId: consumer.id, consentType: ConsentType.DPDP_DATA_COLLECTION },
  });

  if (!existingConsent) {
    await prisma.consentRecord.create({
      data: {
        userId:      consumer.id,
        consentType: ConsentType.DPDP_DATA_COLLECTION,
        accepted:    true,
        ipAddress:   '127.0.0.1',
      },
    });
  }

  console.log(`✓ Test consumer ready: ${consumer.username} / ConsumerPass@2026!`);
  console.log('Database seeding finished.');
}

main()
  .catch((e) => { console.error('Seeding failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
