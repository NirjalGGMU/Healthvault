import { Request, Response } from 'express';
import User, { PASSWORD_HISTORY_SIZE } from '../models/User';
import Appointment from '../models/Appointment';
import { decryptNotes } from '../utils/encryption';
import logger from '../config/logger';

/**
 * GET /api/users/profile (auth required)
 */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const user = await User.findById(req.user.id).select('-password -mfaSecret');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Get profile error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
};

/**
 * PUT /api/users/profile (auth required)
 * Explicit field whitelist — role, password, lock state, and MFA fields
 * can never be mass-assigned through this endpoint.
 */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { name, email } = req.body as { name?: string; email?: string };
    const updates: { name?: string; email?: string } = {};

    if (typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100) {
      updates.name = name.trim();
    }

    if (typeof email === 'string') {
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        res.status(400).json({ message: 'Invalid email format' });
        return;
      }
      const existing = await User.findOne({ email: normalized });
      if (existing && String(existing._id) !== req.user.id) {
        res.status(409).json({ message: 'Email already in use' });
        return;
      }
      updates.email = normalized;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields to update (allowed: name, email)' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -mfaSecret');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    logger.info(`USER: profile updated for ${user._id} (fields: ${Object.keys(updates).join(', ')})`);

    res.status(200).json({ message: 'Profile updated', user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Update profile error: ${message}`);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

/**
 * PUT /api/users/profile/photo (auth required)
 * Accepts a single image (field name "avatar") via multipart/form-data.
 */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No image file provided (field name: avatar)' });
      return;
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl } },
      { new: true }
    ).select('-password -mfaSecret');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    logger.info(`USER: avatar updated for ${user._id}`);

    res.status(200).json({ message: 'Avatar updated', user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Upload avatar error: ${message}`);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

/**
 * GET /api/users/doctors (auth required)
 * Lists doctors so patients can pick one when booking an appointment.
 */
export const getDoctors = async (req: Request, res: Response): Promise<void> => {
  try {
    const doctors = await User.find({ role: 'doctor' })
      .select('_id name email avatarUrl')
      .sort({ name: 1 });

    res.status(200).json({ doctors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Get doctors error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch doctors' });
  }
};

/**
 * PUT /api/users/change-password (auth required)
 * Requires the current password to be re-entered; new password goes through
 * the same bcrypt pre-save hook and policy as registration.
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new password are required' });
      return;
    }

    const policyOk =
      newPassword.length >= 8 &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword);
    if (!policyOk) {
      res.status(400).json({
        message: 'New password needs 8+ characters with uppercase, lowercase, number, and special character',
      });
      return;
    }

    const user = await User.findById(req.user.id).select('+password +passwordHistory');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const matches = await user.comparePassword(currentPassword);
    if (!matches) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }

    if (await user.wasPasswordUsedBefore(newPassword)) {
      res.status(400).json({
        message: `New password cannot match your current password or any of your last ${PASSWORD_HISTORY_SIZE} passwords`,
      });
      return;
    }

    // Retire the outgoing hash into history before it's overwritten
    user.passwordHistory = [user.password, ...(user.passwordHistory ?? [])].slice(0, PASSWORD_HISTORY_SIZE);
    user.password = newPassword; // re-hashed by the pre-save hook
    await user.save();

    logger.info(`USER: password changed for ${user._id}`);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Change password error: ${message}`);
    res.status(500).json({ message: 'Failed to change password' });
  }
};

/**
 * GET /api/users/export (auth required)
 * Self-service data export: returns the requesting user's own profile and
 * appointments as JSON, for the user to download. Scoped strictly to
 * req.user.id — a user can only ever export their own data, never anyone else's.
 */
export const exportUserData = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const user = await User.findById(req.user.id).select('-password -mfaSecret -passwordHistory');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const filter = req.user.role === 'doctor' ? { doctorId: req.user.id } : { patientId: req.user.id };
    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name email')
      .populate('patientId', 'name email')
      .sort({ date: 1, time: 1 });

    const safeAppointments = appointments.map((appointment) => {
      const obj = appointment.toObject() as unknown as Record<string, unknown>;
      obj.notes = typeof obj.notes === 'string' && obj.notes.length > 0 ? decryptNotes(obj.notes) : null;
      return obj;
    });

    logger.info(`USER: ${user._id} exported their own data (${safeAppointments.length} appointments)`);

    res.status(200).json({
      exportedAt: new Date().toISOString(),
      user,
      appointments: safeAppointments,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Export user data error: ${message}`);
    res.status(500).json({ message: 'Failed to export data' });
  }
};

interface ImportRow {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

/**
 * POST /api/users/import (auth + admin only)
 * Bulk-creates users from a parsed CSV/JSON payload: { users: ImportRow[] }.
 * Mirrors registration rules — admin cannot be assigned via import, and
 * passwords still go through the normal bcrypt pre-save hook.
 */
export const importUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = (req.body?.users ?? []) as ImportRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ message: 'No rows to import (expected { users: [...] })' });
      return;
    }
    if (rows.length > 500) {
      res.status(400).json({ message: 'Import is limited to 500 rows per request' });
      return;
    }

    let created = 0;
    const errors: { row: number; email?: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const name = row.name?.trim();
      const email = row.email?.trim().toLowerCase();
      const password = row.password;
      const role = row.role?.trim().toLowerCase();

      if (!name || name.length < 2) {
        errors.push({ row: i + 1, email, reason: 'Missing or invalid name' });
        continue;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: i + 1, email, reason: 'Missing or invalid email' });
        continue;
      }
      if (!password || password.length < 8) {
        errors.push({ row: i + 1, email, reason: 'Password must be at least 8 characters' });
        continue;
      }
      if (role && !['doctor', 'patient'].includes(role)) {
        errors.push({ row: i + 1, email, reason: "Role must be 'doctor' or 'patient'" });
        continue;
      }

      const existing = await User.findOne({ email });
      if (existing) {
        errors.push({ row: i + 1, email, reason: 'Email already exists' });
        continue;
      }

      try {
        await User.create({ name, email, password, role: role || 'patient' });
        created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, email, reason: message });
      }
    }

    logger.info(`USER: admin ${req.user?.id ?? 'unknown'} imported ${created}/${rows.length} users`);

    res.status(200).json({ message: 'Import complete', created, skipped: errors.length, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Import users error: ${message}`);
    res.status(500).json({ message: 'Failed to import users' });
  }
};

/**
 * GET /api/users/all (auth + admin only)
 */
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find()
      .select('-password -mfaSecret')
      .sort({ createdAt: -1 });

    logger.info(`USER: admin ${req.user?.id ?? 'unknown'} listed all users`);

    res.status(200).json({ count: users.length, users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Get all users error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};
