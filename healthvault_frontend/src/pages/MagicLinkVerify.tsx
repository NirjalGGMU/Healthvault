import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { LoginResponse } from '../types';

const MagicLinkVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }

    const verify = async () => {
      try {
        const { data } = await api.post<LoginResponse>('/auth/magic-link/verify', { token });

        if (data.mfaRequired) {
          toast('Enter the 6-digit code from your authenticator app');
          navigate('/mfa-verify');
          return;
        }

        if (data.user) {
          toast.success(`Welcome back, ${data.user.name}!`);
          login(data.user);
          return;
        }

        setStatus('error');
      } catch (error) {
        toast.error(getErrorMessage(error));
        setStatus('error');
      }
    };

    void verify();
  }, [searchParams, navigate, login]);

  return (
    <div className="page mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8 sm:py-12">
      <div className="card text-center">
        {status === 'verifying' ? (
          <LoadingSpinner label={t('magicLink.verifying')} />
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('magicLink.verifyFailedTitle')}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('magicLink.verifyFailedMsg')}</p>
            <Link to="/magic-link" className="btn-primary mt-6 inline-block">
              {t('magicLink.tryAgain')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default MagicLinkVerify;
