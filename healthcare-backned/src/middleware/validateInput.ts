import { NextFunction, Request, Response } from 'express';
import { body, ValidationChain, validationResult } from 'express-validator';

/**
 * Runs after a validation chain; returns 400 with details if any rule failed.
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    return;
  }
  next();
};

/** Registration: name, email, strong password, optional constrained role */
export const registerValidation: ValidationChain[] = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .escape(),
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain a number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain a special character'),
  body('role')
    .optional()
    .isIn(['doctor', 'patient'])
    .withMessage('Role must be doctor or patient'), // admin cannot be self-assigned
];

/** Login: email + password */
export const loginValidation: ValidationChain[] = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

/** MFA verification: 6-digit TOTP token */
export const mfaValidation: ValidationChain[] = [
  body('token')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('Token must be 6 digits')
    .isNumeric()
    .withMessage('Token must be numeric'),
];

/** Appointment booking: doctorId, date, time, optional notes */
export const appointmentValidation: ValidationChain[] = [
  body('doctorId').isMongoId().withMessage('doctorId must be a valid id'),
  body('date')
    .isISO8601()
    .withMessage('date must be a valid ISO 8601 date')
    .custom((value: string) => {
      if (new Date(value).getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new Error('date cannot be in the past');
      }
      return true;
    }),
  body('time')
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('time must be in HH:mm (24h) format'),
  body('notes')
    .optional()
    .isString()
    .withMessage('notes must be a string')
    .isLength({ max: 2000 })
    .withMessage('notes must be at most 2000 characters'),
];
