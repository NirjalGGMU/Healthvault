import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Appointment, { IAppointment } from '../models/Appointment';
import User from '../models/User';
import logger from '../config/logger';
import { encryptNotes, decryptNotes } from '../utils/encryption';
import { getStripe, DEPOSIT_AMOUNT, DEPOSIT_CURRENCY } from '../utils/stripe';

// Notes booked while the frontend still encrypted client-side (now removed)
// decrypt down to this "enc:v1:<iv>:<ciphertext>" string, which the client
// no longer knows how to read. Show a friendly placeholder instead of raw ciphertext.
const LEGACY_CLIENT_ENCRYPTION_PREFIX = 'enc:v1:';

const toSafeAppointment = (appointment: IAppointment): Record<string, unknown> => {
  const obj = appointment.toObject() as unknown as Record<string, unknown>;
  if (typeof obj.notes === 'string' && obj.notes.length > 0) {
    const decrypted = decryptNotes(obj.notes);
    obj.notes = decrypted.startsWith(LEGACY_CLIENT_ENCRYPTION_PREFIX)
      ? '[This note was saved with a retired encryption method and can no longer be displayed]'
      : decrypted;
  } else {
    obj.notes = null;
  }
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
          // Snapshot the deposit at booking time so a later change to the
          // configured rate doesn't retroactively change what an existing
          // unpaid appointment owes.
          depositAmount: DEPOSIT_AMOUNT,
          currency: DEPOSIT_CURRENCY,
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

    // Roll back the transaction: a paid deposit is refunded automatically on
    // cancellation. Refund failures don't block the cancellation itself —
    // the appointment slot must still free up — but are recorded on the
    // record (paymentStatus: 'refund_failed') for admin follow-up rather
    // than silently swallowed.
    let refundWarning: string | null = null;
    if (appointment.paymentStatus === 'paid' && appointment.stripePaymentIntentId) {
      const stripe = getStripe();
      if (!stripe) {
        appointment.paymentStatus = 'refund_failed';
        refundWarning = 'Payments are not configured on this server; refund was not processed';
        logger.error(`PAYMENT: cannot refund appointment ${id} — Stripe is not configured`);
      } else {
        try {
          await stripe.refunds.create({ payment_intent: appointment.stripePaymentIntentId });
          appointment.paymentStatus = 'refunded';
          logger.info(`PAYMENT: refunded deposit for cancelled appointment ${id}`);
        } catch (refundError) {
          const refundMessage = refundError instanceof Error ? refundError.message : 'Unknown error';
          appointment.paymentStatus = 'refund_failed';
          refundWarning = 'Cancellation succeeded but the automatic refund failed — support has been notified';
          logger.error(`PAYMENT: refund failed for appointment ${id}: ${refundMessage}`);
        }
      }
    }

    await appointment.save();

    logger.info(`APPOINTMENT: ${id} cancelled by user ${req.user.id} (role: ${req.user.role})`);

    res.status(200).json({
      message: 'Appointment cancelled',
      ...(refundWarning ? { warning: refundWarning } : {}),
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
