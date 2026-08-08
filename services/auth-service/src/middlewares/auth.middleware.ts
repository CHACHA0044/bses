import type { Request, Response, NextFunction } from 'express';
import { UserRole, AuthenticationError, ForbiddenError, JWT } from '@bses/shared';
import { tokenService } from '../services/token.service';

/**
 * Extracts JWT token from Authorization header (Bearer) or HTTP-Only cookie (`bses_access_token`).
 */
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  if (req.cookies && req.cookies[JWT.ACCESS_TOKEN_COOKIE]) {
    return req.cookies[JWT.ACCESS_TOKEN_COOKIE];
  }

  return null;
};

/**
 * Mandatory authentication middleware — rejects request with 401 if token is missing or invalid.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AuthenticationError('Authentication required');
    }

    const payload = tokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(new AuthenticationError('Invalid or expired access token'));
  }
};

/**
 * Soft authentication middleware — populates `req.user` if valid token is present, does not throw if missing.
 */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req);
    if (token) {
      req.user = tokenService.verifyAccessToken(token);
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }
  next();
};

/**
 * Role-based authorization middleware — checks if authenticated user possesses allowed role.
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError('You do not have permission to access this resource'));
    }

    next();
  };
};

export const requireConsumer = authorize(UserRole.CONSUMER);
export const requireAdmin = authorize(UserRole.ADMIN, UserRole.SUPER_ADMIN);
