import { ConsentType, Prisma } from '@prisma/client';
import { consentRepository } from '../repositories/consent.repository';

export class ConsentService {
  public async recordRegistrationConsent(
    userId: string,
    ipAddress: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // Record Privacy Policy and DPDP Data Collection consent.
    // The optional `tx` parameter threads the parent's Prisma transaction
    // through so both inserts participate in the same atomic unit. Without
    // it, the FK on `consent_records_user_id_fkey` can fail because the
    // user row is not yet visible to a separate connection.
    await consentRepository.createConsent(
      {
        userId,
        consentType: ConsentType.PRIVACY_POLICY,
        accepted: true,
        ipAddress,
        privacyPolicyVersion: 'v1.0',
      },
      tx,
    );

    await consentRepository.createConsent(
      {
        userId,
        consentType: ConsentType.DPDP_DATA_COLLECTION,
        accepted: true,
        ipAddress,
        privacyPolicyVersion: 'v1.0',
      },
      tx,
    );
  }
}

export const consentService = new ConsentService();
