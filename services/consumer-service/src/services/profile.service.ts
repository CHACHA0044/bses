import { AuditAction } from '@prisma/client';
import { NotFoundError, ConflictError, ValidationError } from '@bses/shared';
import { userRepository, UpdateProfileData } from '../repositories/user.repository';
import { auditRepository } from '../repositories/audit.repository';
import { encryptionService } from './encryption.service';
import { notificationClient } from './notification.client';

export interface UpdateProfileDTO {
  email?: string | undefined;
  mobile?: string | undefined;
  aadhaar?: string | null | undefined;
  ipAddress: string;
}

export class ProfileService {
  public async getProfile(userId: string): Promise<any> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User profile');

    const decryptedMobile = user.mobileEncrypted ? encryptionService.decrypt(user.mobileEncrypted) : null;
    const decryptedAadhaar = user.aadhaarEncrypted ? encryptionService.decrypt(user.aadhaarEncrypted) : null;

    return {
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      gender: user.gender,
      email: user.email,
      username: user.username,
      mobile: decryptedMobile,
      aadhaar: decryptedAadhaar,
      caNumber: user.caNumber,
      meterNumber: user.meterNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  public async updateProfile(userId: string, dto: UpdateProfileDTO): Promise<any> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User profile');

    const updateData: UpdateProfileData = {};
    let mobileChanged = false;

    // Check duplicate email
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const existingEmail = await userRepository.findByEmail(dto.email);
      if (existingEmail) {
        throw new ConflictError('A user with this email address already exists');
      }
      updateData.email = dto.email;
    }

    // Check duplicate mobile
    if (dto.mobile) {
      const mobileHash = encryptionService.hashSearchable(dto.mobile);
      if (mobileHash !== user.mobileHash) {
        const existingMobile = await userRepository.findByMobileHash(mobileHash);
        if (existingMobile) {
          throw new ConflictError('A user with this mobile number already exists');
        }
        updateData.mobileHash = mobileHash;
        updateData.mobileEncrypted = encryptionService.encrypt(dto.mobile);
        mobileChanged = true;
      }
    }

    // Aadhaar update
    if (dto.aadhaar !== undefined) {
      updateData.aadhaarEncrypted = dto.aadhaar ? encryptionService.encrypt(dto.aadhaar) : null;
    }

    const updatedUser = await userRepository.updateProfile(userId, updateData);

    // Audit log
    await auditRepository.createAuditLog({
      userId: user.id,
      performedBy: user.username,
      action: AuditAction.PROFILE_UPDATED,
      module: 'PROFILE',
      ipAddress: dto.ipAddress,
    });

    // Notify user if contact info changed
    const currentMobile = dto.mobile || (user.mobileEncrypted ? encryptionService.decrypt(user.mobileEncrypted) : null);
    if (currentMobile && (updateData.email || mobileChanged)) {
      await notificationClient.notifyProfileUpdated(currentMobile);
    }

    return this.getProfile(userId);
  }
}

export const profileService = new ProfileService();
