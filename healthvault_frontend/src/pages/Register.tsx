import { FormEvent, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReCAPTCHA from 'react-google-recaptcha';
import api, { getErrorMessage } from '../api/axios';
import { useLanguage } from '../context/LanguageContext';
import TextCaptcha, { TextCaptchaHandle } from '../components/TextCaptcha';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

interface StrengthResult {
  score: number; // 0-5
  labelKey: string;
  color: string;
}

const computeStrength = (password: string): StrengthResult => {
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

const meetsPolicy = (password: string): boolean =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const Register = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    role: 'patient',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<ReCAPTCHA>(null);
  const [textCaptchaAnswer, setTextCaptchaAnswer] = useState('');
  const [textCaptchaToken, setTextCaptchaToken] = useState<string | null>(null);
  const textCaptchaRef = useRef<TextCaptchaHandle>(null);

  const strength = useMemo(() => computeStrength(form.password), [form.password]);

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (!meetsPolicy(form.password)) {
      next.password =
        'Password needs 8+ characters with an uppercase, lowercase, number, and special character';
    }
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (RECAPTCHA_SITE_KEY && !captchaToken) {
      toast.error(t('register.captchaRequired'));
      return;
    }
    if (!textCaptchaAnswer.trim()) {
      toast.error(t('captcha.textRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        'g-recaptcha-response': captchaToken,
        captchaToken: textCaptchaToken,
        captchaAnswer: textCaptchaAnswer,
      });
      toast.success('Account created! Please log in.');
      navigate('/login');
    } catch (error) {
      toast.error(getErrorMessage(error));
      captchaRef.current?.reset();
      setCaptchaToken(null);
      textCaptchaRef.current?.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{t('register.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('register.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="label">{t('register.fullName')}</label>
            <input
              id="name"
              type="text"
              className="input-field"
              placeholder="Jane Doe"
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="label">{t('register.email')}</label>
            <input
              id="email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="role" className="label">{t('register.iAmA')}</label>
            <select
              id="role"
              className="input-field"
              value={form.role}
              onChange={(e) => set('role')(e.target.value)}
            >
              <option value="patient">{t('role.patient')}</option>
              <option value="doctor">{t('role.doctor')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="password" className="label">{t('register.password')}</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input-field pr-16"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? t('login.hide') : t('login.show')}
                className="absolute inset-y-0 right-3 text-xs font-semibold text-primary-600 dark:text-primary-400"
              >
                {showPassword ? t('login.hide') : t('login.show')}
              </button>
            </div>

            {/* Strength indicator */}
            {form.password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= strength.score ? strength.color : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('register.strength')} <span className="font-semibold">{t(strength.labelKey)}</span>
                </p>
              </div>
            )}
            {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirm" className="label">{t('register.confirmPassword')}</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              placeholder="••••••••"
              value={form.confirm}
              onChange={(e) => set('confirm')(e.target.value)}
            />
            {errors.confirm && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.confirm}</p>}
          </div>

          <TextCaptcha
            ref={textCaptchaRef}
            value={textCaptchaAnswer}
            onValueChange={setTextCaptchaAnswer}
            onTokenChange={setTextCaptchaToken}
          />

          {RECAPTCHA_SITE_KEY && (
            <div className="flex justify-center overflow-x-auto">
              <ReCAPTCHA ref={captchaRef} sitekey={RECAPTCHA_SITE_KEY} onChange={(val) => setCaptchaToken(val)} />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting}
            aria-label={t('register.createAccount')}
          >
            {submitting ? t('register.creatingAccount') : t('register.createAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('register.alreadyHaveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
