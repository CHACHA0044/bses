import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, JWT, createLogger } from '@bses/shared';
import { authenticationService } from '../services/authentication.service';
import { captchaService } from '../services/captcha.service';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator';
import { config } from '../config';

const logger = createLogger({ service: 'auth-controller' });

/**
 * Redact a user-supplied identifier so the audit log can still show that an
 * attempt was made without leaking the full email/username (which may be a
 * sensitive identifier). Keeps the first 2 chars for context.
 */
const redactIdentifier = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.length === 0) return '***';
  if (raw.length <= 2) return `${raw[0]}*`;
  return `${raw.substring(0, 2)}***`;
};

export class AuthController {
  private setCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    rememberMe = false,
  ): void {
    const isProduction = config.NODE_ENV === 'production';
    // Cross-site cookie after deploying frontend (Vercel) and backend (Render) on
    // different registrable domains requires SameSite=None (an enforcement of
    // Secure). Local development stays lax. Controlled via env so behavior is
    // explicit rather than guessed.
    const sameSite = config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none';

    res.cookie(JWT.ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction || sameSite === 'none',
      sameSite,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie(JWT.REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction || sameSite === 'none',
      sameSite,
      maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000, // 7 or 30 days
    });
  }

  private clearCookies(res: Response): void {
    const isProduction = config.NODE_ENV === 'production';
    const sameSite = config.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none';
    const commonOpts = {
      httpOnly: true,
      secure: isProduction || sameSite === 'none',
      sameSite,
    };
    res.clearCookie(JWT.ACCESS_TOKEN_COOKIE, commonOpts);
    res.clearCookie(JWT.REFRESH_TOKEN_COOKIE, commonOpts);
  }

  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Log the attempt at the very top of the request handler — this fires
      // even if validation/Database calls fail or hang, so the operator can
      // see in Render that a registration request was received.
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
      logger.info(
        `[REGISTER_ATTEMPT] timestamp=${new Date().toISOString()} ` +
          `requestId=${(req as { correlationId?: string }).correlationId || 'n/a'} ` +
          `username=${redactIdentifier((req.body as { username?: string })?.username)} ` +
          `email=${redactIdentifier((req.body as { email?: string })?.email)} ` +
          `ip=${ipAddress}`,
      );

      const validated = registerSchema.parse(req.body);
      const ipAddressFinal = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const result = await authenticationService.register({
        ...validated,
        middleName: validated.middleName ?? null,
        aadhaar: validated.aadhaar ?? null,
        caNumber: validated.caNumber ?? null,
        meterNumber: validated.meterNumber ?? null,
        ipAddress: ipAddressFinal,
      });
      this.setCookies(res, result.tokens.accessToken, result.tokens.refreshToken);

      sendCreated(
        res,
        { user: result.user, accessToken: result.tokens.accessToken },
        'Registration successful',
      );
    } catch (err) {
      next(err);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Structured login-attempt log — fires BEFORE validation and BEFORE any
      // database call. This guarantees Render shows the attempt timestamp,
      // correlation ID, redacted identifier, and IP, even if the service
      // hangs or crashes further down the stack.
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';
      logger.info(
        `[LOGIN_ATTEMPT] timestamp=${new Date().toISOString()} ` +
          `requestId=${(req as { correlationId?: string }).correlationId || 'n/a'} ` +
          `identifier=${redactIdentifier((req.body as { identifier?: string })?.identifier)} ` +
          `rememberMe=${(req.body as { rememberMe?: boolean })?.rememberMe === true} ` +
          `ip=${ipAddress}`,
      );

      const validated = loginSchema.parse(req.body);
      const ipAddressFinal = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const result = await authenticationService.login({ ...validated, ipAddress: ipAddressFinal });
      this.setCookies(
        res,
        result.tokens.accessToken,
        result.tokens.refreshToken,
        validated.rememberMe,
      );

      sendSuccess(
        res,
        { user: result.user, accessToken: result.tokens.accessToken },
        'Login successful',
      );
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

  public forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      await authenticationService.forgotPassword(email, ipAddress);
      sendSuccess(
        res,
        null,
        'If an account exists with this email, password reset instructions have been dispatched.',
      );
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

  public changePassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { currentPassword, newPassword, confirmPassword } = changePasswordSchema.parse(
        req.body,
      );
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

  public getCaptcha = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const captcha = captchaService.generateCaptcha();
      sendSuccess(res, captcha);
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();
