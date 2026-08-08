import { ConsentType } from '@prisma/client';
import { consentRepository } from '../repositories/consent.repository';

export class ConsentService {
  public async recordRegistrationConsent(userId: string, ipAddress: string): Promise<void> {
    // Record Privacy Policy and DPDP Data Collection consent
    await consentRepository.createConsent({
      userId,
      consentType: ConsentType.PRIVACY_POLICY,
      accepted: true,
      ipAddress,
      privacyPolicyVersion: 'v1.0',
    });

    await consentRepository.createConsent({
      userId,
      consentType: ConsentType.DPDP_DATA_COLLECTION,
      accepted: true,
      ipAddress,
      privacyPolicyVersion: 'v1.0',
    });
  }
}

export const consentService = new ConsentService();
