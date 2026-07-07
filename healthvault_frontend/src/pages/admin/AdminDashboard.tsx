import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import LiveActivityFeed from '../../components/LiveActivityFeed';
import { Appointment, UserRecord, refName } from '../../types';
import { formatDate } from '../../utils/auth';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-red',
  doctor: 'badge-blue',
  patient: 'badge-green',
};

const AdminDashboard = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, apptsRes] = await Promise.all([
          api.get<{ users: UserRecord[] }>('/users/all'),
          api.get<{ appointments: Appointment[] }>('/appointments/all'),
        ]);
        setUsers(usersRes.data.users);
        setAppointments(apptsRes.data.appointments);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <LoadingSpinner fullScreen label={t('loading.overview')} />;

  const doctors = users.filter((u) => u.role === 'doctor');
  const patients = users.filter((u) => u.role === 'patient');
  const pending = appointments.filter((a) => a.status === 'pending');
  const confirmed = appointments.filter((a) => a.status === 'confirmed');
  const cancelled = appointments.filter((a) => a.status === 'cancelled');
  const locked = users.filter((u) => u.isLocked);
  const mfaUsers = users.filter((u) => u.mfaEnabled);

  const stats = [
    { label: t('dashboard.admin.totalUsers'), value: users.length, color: 'text-primary-600 dark:text-primary-400', to: '/admin/users' },
    { label: t('dashboard.admin.doctors'), value: doctors.length, color: 'text-primary-600 dark:text-primary-400', to: '/admin/users' },
    { label: t('dashboard.admin.patients'), value: patients.length, color: 'text-accent-600 dark:text-accent-400', to: '/admin/users' },
    { label: t('dashboard.admin.appointments'), value: appointments.length, color: 'text-gray-800 dark:text-gray-200', to: '/admin/appointments' },
  ];

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5);

  const recentAppointments = [...appointments]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5);

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.admin.title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.admin.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card transition-shadow hover:shadow-md">
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* System overview */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.admin.systemOverview')}</h2>
        <div className="mt-4 grid gap-4 text-center sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
            <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{pending.length}</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">{t('dashboard.admin.pending')}</p>
          </div>
          <div className="rounded-lg bg-accent-50 p-4 dark:bg-accent-900/20">
            <p className="text-xl font-bold text-accent-700 dark:text-accent-400">{confirmed.length}</p>
            <p className="text-xs text-accent-700 dark:text-accent-400">{t('dashboard.admin.confirmed')}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
            <p className="text-xl font-bold text-red-700 dark:text-red-400">{cancelled.length}</p>
            <p className="text-xs text-red-700 dark:text-red-400">{t('dashboard.admin.cancelled')}</p>
          </div>
          <div className="rounded-lg bg-primary-50 p-4 dark:bg-primary-900/20">
            <p className="text-xl font-bold text-primary-700 dark:text-primary-400">{mfaUsers.length}</p>
            <p className="text-xs text-primary-700 dark:text-primary-400">{t('dashboard.admin.mfaEnabled')}</p>
          </div>
          <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-700">
            <p className="text-xl font-bold text-gray-700 dark:text-gray-200">{locked.length}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300">{t('dashboard.admin.lockedAccounts')}</p>
          </div>
        </div>
      </div>

      {/* Live security activity */}
      <LiveActivityFeed />

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card !p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.admin.newestUsers')}</h2>
            <Link to="/admin/users" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400">
              {t('dashboard.admin.manage')}
            </Link>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentUsers.map((u) => (
              <li key={u._id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-white">{u.name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                </div>
                <span className={ROLE_BADGE[u.role] ?? 'badge-gray'}>{t(`role.${u.role}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card !p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.admin.latestAppointments')}</h2>
            <Link to="/admin/appointments" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400">
              {t('dashboard.admin.viewAll')}
            </Link>
          </div>
          {recentAppointments.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('dashboard.admin.noAppointmentsYet')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentAppointments.map((a) => (
                <li key={a._id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {refName(a.patientId)} → Dr. {refName(a.doctorId)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(a.date)} {t('dashboard.doctor.at')} {a.time}
                    </p>
                  </div>
                  <span className={STATUS_BADGE[a.status] ?? 'badge-gray'}>{t(`status.${a.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
