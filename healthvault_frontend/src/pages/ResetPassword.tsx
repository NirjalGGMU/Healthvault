import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useLanguage } from '../context/LanguageContext';
import { computeStrength, meetsPolicy } from '../utils/passwordPolicy';

const ResetPassword = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => computeStrength(password), [password]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!meetsPolicy(password)) {
      next.password = 'Password needs 8+ characters with an uppercase, lowercase, number, and special character';
    }
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      toast.success(t('resetPassword.success'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
        <div className="card text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('resetPassword.missingTokenTitle')}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('resetPassword.missingTokenMsg')}</p>
          <Link to="/forgot-password" className="btn-primary mt-6 inline-block">
            {t('resetPassword.requestNew')}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
        <div className="card text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('resetPassword.doneTitle')}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('resetPassword.doneMsg')}</p>
          <button type="button" onClick={() => navigate('/login')} className="btn-primary mt-6">
            {t('resetPassword.goToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{t('resetPassword.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('resetPassword.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="label">{t('resetPassword.newPassword')}</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="input-field pr-16"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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

            {password.length > 0 && (
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
            <label htmlFor="confirm" className="label">{t('resetPassword.confirmPassword')}</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              className="input-field"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {errors.confirm && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.confirm}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? t('resetPassword.resetting') : t('resetPassword.reset')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('magicLink.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
