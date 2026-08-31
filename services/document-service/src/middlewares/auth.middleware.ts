import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, JWT, JwtAccessPayload } from '@bses/shared';
import { config } from '../config';

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

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AuthenticationError('Authentication required');
    }

    const payload = jwt.verify(token, config.JWT_SECRET) as JwtAccessPayload;
    req.user = payload;
    next();
  } catch (err) {
    next(new AuthenticationError('Invalid or expired access token'));
  }
};
