import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import Avatar from '../../components/Avatar';
import { Appointment, refAvatar, refName } from '../../types';
import { formatDate } from '../../utils/auth';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

const PatientDashboard = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    void load();
  }, []);

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
