import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, JWT } from '@bses/shared';
import { authenticationService } from '../services/authentication.service';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator';
import { config } from '../config';

export class AuthController {
  private setCookies(res: Response, accessToken: string, refreshToken: string, rememberMe = false): void {
    const isProduction = config.NODE_ENV === 'production';

    res.cookie(JWT.ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie(JWT.REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000, // 7 or 30 days
    });
  }

  private clearCookies(res: Response): void {
    res.clearCookie(JWT.ACCESS_TOKEN_COOKIE);
    res.clearCookie(JWT.REFRESH_TOKEN_COOKIE);
  }

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = registerSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const result = await authenticationService.register({
        ...validated,
        middleName: validated.middleName ?? null,
        aadhaar: validated.aadhaar ?? null,
        caNumber: validated.caNumber ?? null,
        meterNumber: validated.meterNumber ?? null,
        ipAddress,
      });
      this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

      sendCreated(res, { user: result.user, accessToken: result.tokens.accessToken }, 'Registration successful');
    } catch (err) {
      next(err);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = loginSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const result = await authenticationService.login({ ...validated, ipAddress });
      this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken, validated.rememberMe);

      sendSuccess(res, { user: result.user, accessToken: result.tokens.accessToken }, 'Login successful');
    } catch (err) {
      next(err);
    }
  };

  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawRefreshToken = req.cookies[JWT.REFRESH_TOKEN_COOKIE] || req.body.refreshToken;
      const tokens = await authenticationService.refresh(rawRefreshToken);

      this.setCookies(res, tokens.accessToken, tokens.refreshToken);
      sendSuccess(res, { accessToken: tokens.accessToken }, 'Session token refreshed');
    } catch (err) {
      this.clearCookies(res);
      next(err);
    }
  };

  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.sub || 'anonymous';
      const rawRefreshToken = req.cookies[JWT.REFRESH_TOKEN_COOKIE];
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      await authenticationService.logout(userId, rawRefreshToken, ipAddress);
      this.clearCookies(res);

      sendSuccess(res, null, 'Logged out successfully');
    } catch (err) {
      this.clearCookies(res);
      next(err);
    }
  };

  public forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      await authenticationService.forgotPassword(email, ipAddress);
      sendSuccess(res, null, 'If an account exists with this email, password reset instructions have been dispatched.');
    } catch (err) {
      next(err);
    }
  };

  public resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, password, confirmPassword } = resetPasswordSchema.parse(req.body);
      if (password !== confirmPassword) {
        throw new Error('Password confirmation does not match');
      }
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      await authenticationService.resetPassword(token, password, ipAddress);
      this.clearCookies(res);

      sendSuccess(res, null, 'Password reset successful. Please login with your new password.');
    } catch (err) {
      next(err);
    }
  };

  public changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(req.body);
      if (newPassword !== confirmPassword) {
        throw new Error('Password confirmation does not match');
      }
      const userId = req.user!.sub;
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      await authenticationService.changePassword(userId, currentPassword, newPassword, ipAddress);
      sendSuccess(res, null, 'Password updated successfully');
    } catch (err) {
      next(err);
    }
  };

  public getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const user = await authenticationService.getCurrentUser(userId);
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  };

  public getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        sendSuccess(res, { authenticated: false, user: null });
        return;
      }
      const user = await authenticationService.getCurrentUser(req.user.sub);
      sendSuccess(res, { authenticated: true, user });
    } catch (err) {
      sendSuccess(res, { authenticated: false, user: null });
    }
  };
}

export const authController = new AuthController();
