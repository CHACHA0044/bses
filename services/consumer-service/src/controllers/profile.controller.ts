import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@bses/shared';
import { profileService } from '../services/profile.service';
import { updateProfileSchema } from '../validators/profile.validator';

export class ProfileController {
  public getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const profile = await profileService.getProfile(userId);
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  public updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const validated = updateProfileSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const profile = await profileService.updateProfile(userId, { ...validated, ipAddress });
      sendSuccess(res, { profile }, 'Profile updated successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const profileController = new ProfileController();
