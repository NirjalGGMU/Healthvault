import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LoginResponse } from '../types';
import { TEMP_TOKEN_KEY } from '../utils/auth';

const DIGITS = 6;

/**
 * Second step of login for MFA-enabled accounts.
 * Uses the short-lived temp token issued by /auth/login.
 */
const MFAVerify = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [digits, setDigits] = useState<string[]>(Array(DIGITS).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // No temp token -> user landed here directly; send them to login
  useEffect(() => {
    if (!sessionStorage.getItem(TEMP_TOKEN_KEY)) {
      navigate('/login', { replace: true });
    } else {
      inputsRef.current[0]?.focus();
    }
  }, [navigate]);

  const submit = async (code: string) => {
    const tempToken = sessionStorage.getItem(TEMP_TOKEN_KEY);
    if (!tempToken) {
      navigate('/login', { replace: true });
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<LoginResponse>(
        '/auth/verify-mfa',
        { token: code },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      );
      if (data.token && data.user) {
        sessionStorage.removeItem(TEMP_TOKEN_KEY);
        toast.success('MFA verified — welcome back!');
        login(data.token, data.user);
        return;
      }
      toast.error('Unexpected response from server');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setDigits(Array(DIGITS).fill(''));
      inputsRef.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < DIGITS - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    // Auto submit once all six digits are filled
    const code = next.join('');
    if (code.length === DIGITS && !submitting) {
      void submit(code);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGITS);
    if (!pasted) return;
    const next = Array(DIGITS)
      .fill('')
      .map((_, i) => pasted[i] ?? '');
    setDigits(next);
    if (pasted.length === DIGITS && !submitting) {
      void submit(pasted);
    } else {
      inputsRef.current[Math.min(pasted.length, DIGITS - 1)]?.focus();
    }
  };

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-xl dark:bg-primary-900/40">
          🔐
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{t('mfaVerify.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('mfaVerify.subtitle')}</p>

        <div className="mt-8 flex justify-center gap-1.5 sm:gap-2" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              className="h-12 w-9 rounded-lg border border-gray-300 text-center text-lg font-bold focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:ring-primary-900 sm:h-14 sm:w-11 sm:text-xl"
              value={digit}
              disabled={submitting}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {submitting && <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('mfaVerify.verifying')}</p>}

        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">{t('mfaVerify.expiryNote')}</p>
        <button
          type="button"
          className="mt-2 text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400"
          onClick={() => {
            sessionStorage.removeItem(TEMP_TOKEN_KEY);
            navigate('/login');
          }}
        >
          {t('mfaVerify.backToLogin')}
        </button>
      </div>
    </div>
  );
};

export default MFAVerify;
