import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'admin' | 'doctor' | 'patient';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  mfaSecret?: string | null;
  mfaEnabled: boolean;
  loginAttempts: number;
  isLocked: boolean;
  lockUntil?: Date | null;
  lastLogin?: Date | null;
  avatarUrl?: string | null;
  passwordHistory: string[];
  passwordChangedAt: Date;
  createdAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  wasPasswordUsedBefore(candidate: string): Promise<boolean>;
}

/** How many previous password hashes are remembered to block reuse */
export const PASSWORD_HISTORY_SIZE = 5;
/** Force a password change after this many days (zero-trust: credentials expire) */
export const PASSWORD_EXPIRY_DAYS = 90;

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ['admin', 'doctor', 'patient'],
      default: 'patient',
    },
    mfaSecret: { type: String, select: false, default: null },
    mfaEnabled: { type: Boolean, default: false },
    loginAttempts: { type: Number, default: 0 },
    isLocked: { type: Boolean, default: false },
    lockUntil: { type: Date, default: null },
    lastLogin: { type: Date, default: null },
    avatarUrl: { type: String, default: null },
    // Hashes of previous passwords (never plaintext) — blocks password reuse
    passwordHistory: { type: [String], select: false, default: [] },
    passwordChangedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Hash password with bcryptjs before save. Callers that change an existing
// password (not initial registration) are responsible for pushing the
// outgoing hash into passwordHistory themselves before reassigning
// `password` — see userController.changePassword.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password as string);
};

/** True if `candidate` matches the current password or any of the last N historical hashes */
userSchema.methods.wasPasswordUsedBefore = async function (candidate: string): Promise<boolean> {
  const self = this as IUser;
  if (await bcrypt.compare(candidate, self.password)) return true;
  for (const oldHash of self.passwordHistory ?? []) {
    if (await bcrypt.compare(candidate, oldHash)) return true;
  }
  return false;
};

export default mongoose.model<IUser>('User', userSchema);
