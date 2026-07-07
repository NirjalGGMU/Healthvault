import crypto from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Appointment, { IAppointment } from '../models/Appointment';
import User from '../models/User';
import logger from '../config/logger';

//  Notes encryption (AES-256-GCM) 

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const getEncryptionKey = (): Buffer => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined; cannot derive encryption key');
  }
  return crypto.scryptSync(secret, 'healthvault-notes-salt', 32);
};

export const encryptNotes = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decryptNotes = (payload: string): string => {
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    logger.error('Failed to decrypt appointment notes (tampered or wrong key)');
    return '';
  }
};

const toSafeAppointment = (appointment: IAppointment): Record<string, unknown> => {
  const obj = appointment.toObject() as unknown as Record<string, unknown>;
  obj.notes = typeof obj.notes === 'string' && obj.notes.length > 0 ? decryptNotes(obj.notes) : null;
  return obj;
};

//  Controllers 

/**
 * POST /api/appointments/book (auth + patient role)
 * Input validated by appointmentValidation middleware.
 */
/** Mongo's duplicate-key error code — thrown when the partial unique index rejects a booking */
const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000;

export const bookAppointment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  const { doctorId, date, time, notes } = req.body as {
    doctorId: string;
    date: string;
    time: string;
    notes?: string;
  };

  // Real ACID transaction (Atlas clusters are replica sets, so this is supported):
  // the conflict check and the insert happen atomically, so two concurrent
  // requests for the same slot can't both pass the check before either commits.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const doctor = await User.findById(doctorId).session(session);
    if (!doctor || doctor.role !== 'doctor') {
      await session.abortTransaction();
      res.status(404).json({ message: 'Doctor not found' });
      return;
    }

    const conflict = await Appointment.findOne({
      doctorId: doctor._id,
      date: new Date(date),
      time,
      isActive: true,
    }).session(session);
    if (conflict) {
      await session.abortTransaction();
      res.status(409).json({ message: 'This time slot is already booked for the selected doctor' });
      return;
    }

    const [appointment] = await Appointment.create(
      [
        {
          patientId: req.user.id,
          doctorId: doctor._id,
          date: new Date(date),
          time,
          notes: notes ? encryptNotes(notes) : null,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    logger.info(
      `APPOINTMENT: patient ${req.user.id} booked ${String(appointment._id)} with doctor ${doctorId} on ${date} ${time}`
    );

    res.status(201).json({
      message: 'Appointment booked',
      appointment: toSafeAppointment(appointment),
    });
  } catch (error) {
    await session.abortTransaction().catch(() => undefined);

    if (isDuplicateKeyError(error)) {
      res.status(409).json({ message: 'This time slot was just booked by someone else — please pick another' });
      return;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Book appointment error: ${message}`);
    res.status(500).json({ message: 'Failed to book appointment' });
  } finally {
    await session.endSession();
  }
};

/**
 * GET /api/appointments/my (auth required)
 * Patients see appointments they booked; doctors see appointments assigned to them.
 */
export const getMyAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const filter =
      req.user.role === 'doctor'
        ? { doctorId: req.user.id }
        : { patientId: req.user.id };

    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name email avatarUrl')
      .populate('patientId', 'name email avatarUrl')
      .sort({ date: 1, time: 1 });

    res.status(200).json({
      count: appointments.length,
      appointments: appointments.map(toSafeAppointment),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Get my appointments error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
};

/**
 * PUT /api/appointments/:id/cancel (auth required)
 * Only the owning patient, the assigned doctor, or an admin may cancel.
 */
export const cancelAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid appointment id' });
      return;
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      res.status(404).json({ message: 'Appointment not found' });
      return;
    }

    const isOwnerPatient = String(appointment.patientId) === req.user.id;
    const isAssignedDoctor = String(appointment.doctorId) === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwnerPatient && !isAssignedDoctor && !isAdmin) {
      logger.warn(
        `APPOINTMENT: user ${req.user.id} (role: ${req.user.role}) denied cancel on ${id}`
      );
      res.status(403).json({ message: 'Forbidden: you cannot cancel this appointment' });
      return;
    }

    if (appointment.status === 'cancelled') {
      res.status(400).json({ message: 'Appointment is already cancelled' });
      return;
    }

    appointment.status = 'cancelled';
    await appointment.save();

    logger.info(`APPOINTMENT: ${id} cancelled by user ${req.user.id} (role: ${req.user.role})`);

    res.status(200).json({
      message: 'Appointment cancelled',
      appointment: toSafeAppointment(appointment),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Cancel appointment error: ${message}`);
    res.status(500).json({ message: 'Failed to cancel appointment' });
  }
};

/**
 * GET /api/appointments/all (auth + admin/doctor role)
 * Admins see everything; doctors see only their own schedule.
 */
export const getAllAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const filter = req.user.role === 'doctor' ? { doctorId: req.user.id } : {};

    const appointments = await Appointment.find(filter)
      .populate('doctorId', 'name email avatarUrl')
      .populate('patientId', 'name email avatarUrl')
      .sort({ date: 1, time: 1 });

    logger.info(`APPOINTMENT: user ${req.user.id} (role: ${req.user.role}) listed appointments`);

    res.status(200).json({
      count: appointments.length,
      appointments: appointments.map(toSafeAppointment),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Get all appointments error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch appointments' });
  }
};
