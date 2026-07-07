import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { UserRecord } from '../types';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const meetsPolicy = (password: string): boolean =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const Profile = () => {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const passwordExpired = searchParams.get('expired') === '1';

  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<{ user: UserRecord }>('/users/profile');
        setProfile(data.user);
        setName(data.user.name);
        setEmail(data.user.email);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Enter a valid email address');
      return;
    }
    setSavingProfile(true);
    try {
      const { data } = await api.put<{ user: UserRecord }>('/users/profile', {
        name: name.trim(),
        email: email.trim(),
      });
      setProfile(data.user);
      updateUser({ name: data.user.name, email: data.user.email });
      toast.success('Profile updated');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.put<{ user: UserRecord }>('/users/profile/photo', formData);
      setProfile(data.user);
      updateUser({ avatarUrl: data.user.avatarUrl });
      toast.success('Profile picture updated');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      URL.revokeObjectURL(localPreview);
      setAvatarPreview(null);
      setUploadingAvatar(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (!meetsPolicy(newPassword)) {
      toast.error('New password needs 8+ chars with uppercase, lowercase, number, and special character');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/users/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen label={t('loading.profile')} />;

  return (
    <div className="page mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.subtitle')}</p>
      </div>

      {passwordExpired && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {t('profile.passwordExpiredBanner')}
        </div>
      )}

      {/* Profile info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.accountDetails')}</h2>

        <div className="mt-4 flex items-center gap-4">
          <img
            src={avatarPreview ?? (profile?.avatarUrl ? `${API_ORIGIN}${profile.avatarUrl}` : undefined)}
            alt=""
            className="h-16 w-16 rounded-full border border-gray-200 bg-gray-100 object-cover dark:border-gray-600 dark:bg-gray-700"
            style={!avatarPreview && !profile?.avatarUrl ? { display: 'none' } : undefined}
          />
          {!avatarPreview && !profile?.avatarUrl && (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xl font-semibold text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <label htmlFor="avatar" className="btn-outline cursor-pointer !py-2">
              {uploadingAvatar ? t('profile.uploading') : t('profile.changePhoto')}
            </label>
            <input
              id="avatar"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
              aria-label={t('profile.changePhoto')}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('profile.photoHint')}</p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="label">{t('profile.fullName')}</label>
            <input
              id="name"
              type="text"
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="email" className="label">{t('profile.email')}</label>
            <input
              id="email"
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <span>{t('profile.role')}</span>
            <span className="badge-blue capitalize">
              {t(`role.${profile?.role ?? user?.role ?? 'patient'}`)}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('profile.roleNote')}</span>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={savingProfile}
            aria-label={t('profile.saveChanges')}
          >
            {savingProfile ? t('profile.saving') : t('profile.saveChanges')}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.changePassword')}</h2>
        <form onSubmit={savePassword} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="current" className="label">{t('profile.currentPassword')}</label>
            <input
              id="current"
              type="password"
              className="input-field"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new" className="label">{t('profile.newPassword')}</label>
              <input
                id="new"
                type="password"
                className="input-field"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm" className="label">{t('profile.confirmNewPassword')}</label>
              <input
                id="confirm"
                type="password"
                className="input-field"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn-outline"
            disabled={savingPassword}
            aria-label={t('profile.updatePassword')}
          >
            {savingPassword ? t('profile.updating') : t('profile.updatePassword')}
          </button>
        </form>
      </div>

      {/* MFA */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('profile.mfaTitle')}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {user?.mfaEnabled || profile?.mfaEnabled ? t('profile.mfaEnabledDesc') : t('profile.mfaDisabledDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user?.mfaEnabled || profile?.mfaEnabled ? (
              <span className="badge-green">{t('profile.enabled')}</span>
            ) : (
              <span className="badge-yellow">{t('profile.disabled')}</span>
            )}
            <Link to="/mfa-setup" className="btn-accent !py-2">
              {t('profile.manageMfa')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
