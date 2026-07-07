import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useLanguage } from '../context/LanguageContext';
import { MagicLinkResponse } from '../types';

/**
 * Requests a passwordless login link. No mail provider is configured in this
 * project, so the backend logs the link server-side and (outside production
 * only) echoes it back here as `devMagicLink` — shown directly on the page
 * as a stand-in for actually emailing it.
 */
const MagicLink = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    setDevLink(null);
    try {
      const { data } = await api.post<MagicLinkResponse>('/auth/magic-link', { email: email.trim() });
      toast.success(data.message);
      if (data.devMagicLink) setDevLink(data.devMagicLink);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">{t('magicLink.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('magicLink.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label">{t('magicLink.email')}</label>
            <input
              id="email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? t('magicLink.sending') : t('magicLink.send')}
          </button>
        </form>

        {devLink && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-semibold">{t('magicLink.devNote')}</p>
            <a href={devLink} className="mt-1 block break-all underline">
              {devLink}
            </a>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('magicLink.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default MagicLink;
