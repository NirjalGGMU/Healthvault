import { FormEvent, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { LoginResponse, MfaSetupResponse } from '../types';
import { setToken } from '../utils/auth';

/**
 * Authenticated MFA enrolment:
 * 1) generate TOTP secret -> 2) scan QR / copy key -> 3) confirm one code.
 */
const MFASetup = () => {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const [secret, setSecret] = useState<MfaSetupResponse | null>(null);
  const [otp, setOtp] = useState('');
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post<MfaSetupResponse>('/auth/enable-mfa');
      setSecret(data);
      toast.success('Secret generated — scan the QR code');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setGenerating(false);
    }
  };

  const copyKey = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.base32);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the key manually');
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Enter the 6-digit code from your app');
      return;
    }
    setVerifying(true);
    try {
      const { data } = await api.post<LoginResponse>('/auth/verify-mfa', { token: otp });
      if (data.token) setToken(data.token); // backend rotates the JWT
      updateUser({ mfaEnabled: true });
      setSecret(null);
      setOtp('');
      toast.success('MFA is now enabled on your account!');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="page mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('mfaSetup.title')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('mfaSetup.subtitle')}</p>

      {user?.mfaEnabled && !secret ? (
        <div className="card mt-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-lg text-accent-600 dark:bg-accent-900/40 dark:text-accent-400">
              ✓
            </span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{t('mfaSetup.enabledTitle')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('mfaSetup.enabledDesc')}</p>
            </div>
          </div>
          <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('mfaSetup.lostDevice')}</p>
            <button type="button" onClick={generate} disabled={generating} className="btn-outline mt-3">
              {generating ? t('mfaSetup.regenerating') : t('mfaSetup.regenerate')}
            </button>
          </div>
        </div>
      ) : !secret ? (
        <div className="card mt-6 text-center">
          <p className="text-gray-600 dark:text-gray-300">
            {t('mfaSetup.disabledText')} <span className="badge-yellow">{t('mfaSetup.disabledBadge')}</span>{' '}
            {t('mfaSetup.disabledSuffix')}
          </p>
          <button type="button" onClick={generate} disabled={generating} className="btn-primary mt-6">
            {generating ? <LoadingSpinner size="sm" /> : t('mfaSetup.enableButton')}
          </button>
        </div>
      ) : null}

      {secret && (
        <div className="card mt-6">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('mfaSetup.step1')}</h2>
          <div className="mt-4 flex justify-center rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700">
            <QRCodeSVG value={secret.otpauthUrl} size={192} />
          </div>

          <h2 className="mt-6 font-semibold text-gray-900 dark:text-white">{t('mfaSetup.step2')}</h2>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-sm font-mono text-gray-800 dark:bg-gray-900 dark:text-gray-200">
              {secret.base32}
            </code>
            <button type="button" onClick={copyKey} className="btn-outline !py-2">
              {copied ? t('mfaSetup.copied') : t('mfaSetup.copy')}
            </button>
          </div>

          <h2 className="mt-6 font-semibold text-gray-900 dark:text-white">{t('mfaSetup.step3')}</h2>
          <form onSubmit={verify} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="input-field max-w-full text-center text-lg font-bold tracking-widest sm:max-w-[160px]"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="btn-accent" disabled={verifying}>
              {verifying ? t('mfaSetup.verifying') : t('mfaSetup.verifyEnable')}
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{t('mfaSetup.activateNote')}</p>
        </div>
      )}
    </div>
  );
};

export default MFASetup;
