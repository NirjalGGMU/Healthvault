import { NextFunction, Request, Response } from 'express';
import logger from '../config/logger';

/**
 * Role-based access control (RBAC).
 * Usage: router.get('/all', protect, authorizeRoles('admin'), handler)
 */
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        `RBAC denial: user ${req.user.id} (role: ${req.user.role}) attempted ${req.method} ${req.originalUrl}`
      );
      res.status(403).json({ message: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
  };
};
