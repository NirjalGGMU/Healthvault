import mongoose, { Document, Schema, Types } from 'mongoose';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

/**
 * unpaid: no successful Checkout Session yet.
 * paid: Stripe confirmed the deposit via the checkout.session.completed webhook.
 * refunded: deposit was returned after a cancellation of a paid appointment.
 * refund_failed: cancellation succeeded but the Stripe refund call errored —
 *   surfaced to admins for manual follow-up rather than silently dropped.
 */
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'refund_failed';

export interface IAppointment extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  date: Date;
  time: string;
  status: AppointmentStatus;
  isActive: boolean; // mirrors status !== 'cancelled'; exists only so the partial unique index below has an operator MongoDB supports ($eq, not $ne)
  notes?: string | null; // stored encrypted (AES-256-GCM)
  depositAmount: number; // minor currency units (e.g. cents), snapshot at booking time
  currency: string;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  createdAt: Date;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'patientId is required'],
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'doctorId is required'],
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Appointment date is required'],
    },
    time: {
      type: String,
      required: [true, 'Appointment time is required'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: null }, // encrypted at rest
    depositAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd' },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded', 'refund_failed'],
      default: 'unpaid',
    },
    stripeCheckoutSessionId: { type: String, default: null, index: true },
    stripePaymentIntentId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Keep isActive in sync whenever status changes via .save()
appointmentSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.isActive = this.status !== 'cancelled';
  }
  next();
});

// DB-level guarantee against double-booking a slot — the app-level check-then-act
// query in the controller can still race under concurrent requests, but this
// unique index makes the database itself reject the loser of that race.
// Cancelled appointments (isActive: false) are excluded so a freed slot can be rebooked.
appointmentSchema.index(
  { doctorId: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { isActive: { $eq: true } } }
);

export default mongoose.model<IAppointment>('Appointment', appointmentSchema);
