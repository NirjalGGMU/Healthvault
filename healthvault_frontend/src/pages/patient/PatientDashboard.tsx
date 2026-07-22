import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import Avatar from '../../components/Avatar';
import { Appointment, refAvatar, refName } from '../../types';
import { formatDate, formatDateTime } from '../../utils/auth';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

// Must match healthcare-backned's User.PASSWORD_EXPIRY_DAYS
const PASSWORD_EXPIRY_DAYS = 90;

const PatientDashboard = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [documentCount, setDocumentCount] = useState<number | null>(null);

  const load = async () => {
    try {
      const { data } = await api.get<{ appointments: Appointment[] }>('/appointments/my');
      setAppointments(data.appointments);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Non-critical widget — a failed fetch just hides the card, doesn't block the dashboard
    api
      .get<{ count: number }>('/documents')
      .then(({ data }) => setDocumentCount(data.count))
      .catch(() => setDocumentCount(null));
  }, []);

  useEffect(() => {
    void load();
  }, []);

  const cancelNext = async (id: string) => {
    if (!window.confirm(t('appointments.confirmCancel'))) return;
    setCancellingId(id);
    try {
      await api.put(`/appointments/${id}/cancel`);
      toast.success('Appointment cancelled');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <LoadingSpinner fullScreen label={t('loading.dashboard')} />;

  const now = Date.now();
  const upcoming = appointments.filter(
    (a) => a.status !== 'cancelled' && new Date(a.date).getTime() >= now - 24 * 60 * 60 * 1000
  );
  const pending = appointments.filter((a) => a.status === 'pending');
  const cancelled = appointments.filter((a) => a.status === 'cancelled');

  const stats = [
    { label: t('dashboard.patient.totalAppointments'), value: appointments.length, color: 'text-primary-600 dark:text-primary-400' },
    { label: t('dashboard.patient.upcoming'), value: upcoming.length, color: 'text-accent-600 dark:text-accent-400' },
    { label: t('dashboard.patient.pendingConfirmation'), value: pending.length, color: 'text-yellow-600 dark:text-yellow-400' },
    { label: t('dashboard.patient.cancelled'), value: cancelled.length, color: 'text-red-600 dark:text-red-400' },
  ];

  const recent = [...upcoming]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  // Soonest upcoming, non-cancelled appointment (already sorted/filtered above)
  const nextAppointment = recent[0] ?? null;
  let nextAppointmentDays = 0;
  if (nextAppointment) {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const apptDate = new Date(nextAppointment.date);
    const apptMidnight = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate());
    nextAppointmentDays = Math.round((apptMidnight.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));
  }

  const avatarComplete = Boolean(user?.avatarUrl);
  const mfaComplete = Boolean(user?.mfaEnabled);
  const completedSteps = [avatarComplete, mfaComplete].filter(Boolean).length;

  let passwordDaysRemaining: number | null = null;
  if (user?.passwordChangedAt) {
    const expiresAt =
      new Date(user.passwordChangedAt).getTime() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    passwordDaysRemaining = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  }

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hi, {user?.name?.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.patient.subtitle')}</p>
        </div>
        <Link to="/patient/book" className="btn-accent">
          {t('dashboard.patient.bookAppointment')}
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Next appointment + security status + profile completeness */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('dashboard.patient.nextAppointment.title')}
          </h2>
          {nextAppointment ? (
            <div className="mt-4">
              <div className="flex items-center gap-3">
                <Avatar avatarUrl={refAvatar(nextAppointment.doctorId)} name={refName(nextAppointment.doctorId)} size="sm" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Dr. {refName(nextAppointment.doctorId)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(nextAppointment.date)} {t('dashboard.doctor.at')} {nextAppointment.time}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-primary-600 dark:text-primary-400">
                {t('dashboard.patient.nextAppointment.headingPrefix')}{' '}
                {nextAppointmentDays <= 0
                  ? t('dashboard.patient.nextAppointment.today')
                  : nextAppointmentDays === 1
                    ? t('dashboard.patient.nextAppointment.tomorrow')
                    : `${t('dashboard.patient.nextAppointment.inPrefix')} ${nextAppointmentDays} ${t('dashboard.patient.nextAppointment.days')}`}
              </p>
              <button
                type="button"
                onClick={() => cancelNext(nextAppointment._id)}
                disabled={cancellingId === nextAppointment._id}
                className="btn-danger mt-4 !px-3 !py-1.5 !text-xs"
              >
                {cancellingId === nextAppointment._id ? t('appointments.cancelling') : t('appointments.cancel')}
              </button>
            </div>
          ) : (
            <div className="mt-4 py-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.patient.nextAppointment.empty')}</p>
              <Link to="/patient/book" className="btn-primary mt-4 inline-block">
                {t('dashboard.patient.nextAppointment.emptyCta')}
              </Link>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('dashboard.patient.security.title')}
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="text-gray-700 dark:text-gray-300">{t('dashboard.patient.security.mfaLabel')}</span>
              <div className="flex items-center gap-2">
                <span className={mfaComplete ? 'badge-green' : 'badge-red'}>
                  {mfaComplete ? `✓ ${t('profile.enabled')}` : `✗ ${t('profile.disabled')}`}
                </span>
                {!mfaComplete && (
                  <Link to="/mfa-setup" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
                    {t('dashboard.patient.security.setUp')}
                  </Link>
                )}
              </div>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-gray-700 dark:text-gray-300">{t('dashboard.patient.security.passwordLabel')}</span>
              <div className="flex items-center gap-2">
                {passwordDaysRemaining !== null && (
                  <span
                    className={
                      passwordDaysRemaining < 14
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }
                  >
                    {passwordDaysRemaining >= 0
                      ? `${t('dashboard.patient.security.passwordExpiresPrefix')} ${passwordDaysRemaining} ${t('dashboard.patient.nextAppointment.days')}`
                      : `${t('dashboard.patient.security.passwordExpiredPrefix')} ${Math.abs(passwordDaysRemaining)} ${t('dashboard.patient.nextAppointment.days')} ${t('dashboard.patient.security.ago')}`}
                  </span>
                )}
                <Link to="/profile" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
                  {t('dashboard.patient.security.changePassword')}
                </Link>
              </div>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="text-gray-700 dark:text-gray-300">{t('dashboard.patient.security.lastLoginLabel')}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {user?.lastLogin ? formatDateTime(user.lastLogin) : t('common.never')}
              </span>
            </li>
          </ul>
        </div>

        {completedSteps < 2 && (
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {t('dashboard.patient.profileCompleteness.title')}
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {completedSteps} {t('dashboard.patient.profileCompleteness.stepsOf')} 2{' '}
                {t('dashboard.patient.profileCompleteness.stepsComplete')}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-all"
                style={{ width: `${(completedSteps / 2) * 100}%` }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              <li className="flex items-center justify-between gap-2 text-sm">
                <span className={avatarComplete ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}>
                  {avatarComplete ? '✓ ' : ''}
                  {t('dashboard.patient.profileCompleteness.avatarItem')}
                </span>
                {!avatarComplete && (
                  <Link to="/profile" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
                    {t('dashboard.patient.profileCompleteness.fix')}
                  </Link>
                )}
              </li>
              <li className="flex items-center justify-between gap-2 text-sm">
                <span className={mfaComplete ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}>
                  {mfaComplete ? '✓ ' : ''}
                  {t('dashboard.patient.profileCompleteness.mfaItem')}
                </span>
                {!mfaComplete && (
                  <Link to="/mfa-setup" className="font-semibold text-primary-600 hover:underline dark:text-primary-400">
                    {t('dashboard.patient.profileCompleteness.fix')}
                  </Link>
                )}
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Documents vault */}
      {documentCount !== null && (
        <Link
          to="/patient/documents"
          className="card flex items-center justify-between gap-3 !py-4 transition-colors hover:border-primary-300 dark:hover:border-primary-700"
        >
          <span className="text-sm text-gray-700 dark:text-gray-300">
            🔒 {documentCount} {t('dashboard.patient.vaultCard.suffix')}
          </span>
          <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
            {t('dashboard.patient.vaultCard.viewLink')} →
          </span>
        </Link>
      )}

      {/* Recent / upcoming */}
      <div className="card !p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.patient.upcomingAppointments')}</h2>
          <Link to="/patient/appointments" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400">
            {t('dashboard.patient.viewAll')}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.patient.noUpcoming')}</p>
            <Link to="/patient/book" className="btn-primary mt-4">
              {t('dashboard.patient.bookFirst')}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {recent.map((a) => (
              <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Avatar avatarUrl={refAvatar(a.doctorId)} name={refName(a.doctorId)} size="sm" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Dr. {refName(a.doctorId)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(a.date)} {t('dashboard.doctor.at')} {a.time}
                    </p>
                  </div>
                </div>
                <span className={STATUS_BADGE[a.status] ?? 'badge-gray'}>{t(`status.${a.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PatientDashboard;
