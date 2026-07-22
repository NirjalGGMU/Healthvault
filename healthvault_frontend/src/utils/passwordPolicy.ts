export interface StrengthResult {
  score: number; // 0-5
  labelKey: string;
  color: string;
}

/** Shared by Register and ResetPassword — keeps the strength meter and policy check identical everywhere a new password is set. */
export const computeStrength = (password: string): StrengthResult => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;

  if (score <= 1) return { score, labelKey: 'register.strengthWeak', color: 'bg-red-500' };
  if (score === 2) return { score, labelKey: 'register.strengthFair', color: 'bg-yellow-500' };
  if (score === 3) return { score, labelKey: 'register.strengthGood', color: 'bg-primary-500' };
  return { score, labelKey: 'register.strengthStrong', color: 'bg-accent-500' };
};

/** Mirrors the backend policy enforced in registerValidation / changePassword / resetPassword. */
export const meetsPolicy = (password: string): boolean =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);
