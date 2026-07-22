import { FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReCAPTCHA from 'react-google-recaptcha';
import api, { getErrorMessage, isLockedError } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import TextCaptcha, { TextCaptchaHandle } from '../components/TextCaptcha';
import { LoginPrecheckResponse, LoginResponse } from '../types';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState<'email' | 'credentials'>('email');
  const [checkingAccount, setCheckingAccount] = useState(false);
  // Server-decided, per account (see /auth/login-precheck) — never assumed client-side.
  const [captchaRequired, setCaptchaRequired] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<ReCAPTCHA>(null);
  const [textCaptchaAnswer, setTextCaptchaAnswer] = useState('');
  const [textCaptchaToken, setTextCaptchaToken] = useState<string | null>(null);
  const textCaptchaRef = useRef<TextCaptchaHandle>(null);

  const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setErrors({ email: 'Enter a valid email address' });
      return;
    }
    setErrors({});
    setCheckingAccount(true);
    try {
      const { data } = await api.post<LoginPrecheckResponse>('/auth/login-precheck', {
        email: email.trim(),
      });
      setCaptchaRequired(data.captchaRequired);
      setStep('credentials');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCheckingAccount(false);
    }
  };

  const handleChangeEmail = () => {
    setStep('email');
    setPassword('');
    setLocked(false);
    setErrors({});
    setCaptchaToken(null);
    captchaRef.current?.reset();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (password.length === 0) next.password = 'Password is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (captchaRequired) {
      if (RECAPTCHA_SITE_KEY && !captchaToken) {
        toast.error(t('register.captchaRequired'));
        return;
      }
      if (!textCaptchaAnswer.trim()) {
        toast.error(t('captcha.textRequired'));
        return;
      }
    }

    setLocked(false);
    setSubmitting(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        email: email.trim(),
        password,
        ...(captchaRequired && {
          'g-recaptcha-response': captchaToken,
          captchaToken: textCaptchaToken,
          captchaAnswer: textCaptchaAnswer,
        }),
      });

      // MFA-enabled account: an mfaPending session cookie is already set —
      // go verify the OTP.
      if (data.mfaRequired) {
        toast('Enter the 6-digit code from your authenticator app');
        navigate('/mfa-verify');
        return;
      }

      if (data.user) {
        toast.success(`Welcome back, ${data.user.name}!`);
        login(data.user); // navigates to the role dashboard
        return;
      }

      toast.error('Unexpected response from server');
    } catch (error) {
      if (isLockedError(error)) {
        setLocked(true);
      } else {
        toast.error(getErrorMessage(error));
      }
      if (captchaRequired) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
        textCaptchaRef.current?.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('login.subtitle')}</p>

        {locked && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-semibold">{t('login.accountLockedTitle')}</p>
            <p className="mt-1">{t('login.accountLockedMsg')}</p>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">{t('login.email')}</label>
              <input
                id="email"
                type="email"
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
              {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={checkingAccount} aria-label={t('login.continue')}>
              {checkingAccount ? t('login.checkingAccount') : t('login.continue')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email-readonly" className="label">{t('login.email')}</label>
              <input id="email-readonly" type="email" className="input-field" value={email} disabled />
              <button
                type="button"
                onClick={handleChangeEmail}
                className="mt-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
              >
                {t('login.changeEmail')}
              </button>
            </div>

            <div>
              <label htmlFor="password" className="label">{t('login.password')}</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-16"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
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
              <div className="mt-1 flex items-center justify-between">
                {errors.password ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.password}</p>
                ) : (
                  <span />
                )}
                <Link to="/forgot-password" className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400">
                  {t('login.forgotPassword')}
                </Link>
              </div>
            </div>

            {captchaRequired && (
              <>
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
              </>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting} aria-label={t('login.signIn')}>
              {submitting ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('login.newToHealthVault')}{' '}
          <Link to="/register" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('login.createAccount')}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/magic-link" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('login.passwordlessLink')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
