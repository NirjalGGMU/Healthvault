export type UserRole = 'admin' | 'doctor' | 'patient';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled';

/** User shape returned by login / verify-mfa / register */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mfaEnabled?: boolean;
  avatarUrl?: string | null;
  lastLogin?: string | null;
  passwordChangedAt?: string | null;
}

/** Full user document returned by /users/profile and /users/all */
export interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  mfaEnabled: boolean;
  loginAttempts?: number;
  isLocked?: boolean;
  lastLogin?: string | null;
  createdAt?: string;
  avatarUrl?: string | null;
  passwordChangedAt?: string;
}

/** Minimal doctor entry returned by /users/doctors */
export interface DoctorOption {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

/** Populated ref inside appointments (backend populates name + email + avatarUrl) */
export interface PopulatedUserRef {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'refund_failed';

export interface Appointment {
  _id: string;
  patientId: PopulatedUserRef | string;
  doctorId: PopulatedUserRef | string;
  date: string;
  time: string;
  status: AppointmentStatus;
  notes?: string | null;
  depositAmount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  createdAt?: string;
}

export interface LoginResponse {
  message: string;
  user?: AuthUser;
  mfaRequired?: boolean;
}

export interface LoginPrecheckResponse {
  captchaRequired: boolean;
}

export interface MagicLinkResponse {
  message: string;
  /** Dev-mode only stand-in for actually emailing the link (no mail provider configured) */
  devMagicLink?: string;
}

export interface PasswordResetRequestResponse {
  message: string;
  /** Dev-mode only stand-in for actually emailing the link (no mail provider configured) */
  devResetLink?: string;
}

export interface MfaSetupResponse {
  message: string;
  base32: string;
  otpauthUrl: string;
}

export interface VaultDocument {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ApiErrorBody {
  message: string;
  errors?: { msg: string; path?: string }[];
  code?: string;
}

/** Safely read the name off a possibly-populated user ref */
export const refName = (ref: PopulatedUserRef | string): string =>
  typeof ref === 'string' ? 'Unknown' : ref.name;

/** Safely read the avatar URL off a possibly-populated user ref */
export const refAvatar = (ref: PopulatedUserRef | string): string | null | undefined =>
  typeof ref === 'string' ? null : ref.avatarUrl;

/** Safely read the email off a possibly-populated user ref */
export const refEmail = (ref: PopulatedUserRef | string): string =>
  typeof ref === 'string' ? '—' : ref.email;
