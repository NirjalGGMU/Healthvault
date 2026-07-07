import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Appointment, refName } from '../../types';
import { isToday } from '../../utils/auth';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

const DoctorDashboard = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Backend scopes /appointments/all to the doctor's own schedule
        const { data } = await api.get<{ appointments: Appointment[] }>('/appointments/all');
        setAppointments(data.appointments);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <LoadingSpinner fullScreen label={t('loading.schedule')} />;

  const todays = appointments.filter((a) => isToday(a.date) && a.status !== 'cancelled');
  const pending = appointments.filter((a) => a.status === 'pending');
  const uniquePatients = new Set(
    appointments.map((a) => (typeof a.patientId === 'string' ? a.patientId : a.patientId._id))
  );

  const stats = [
    { label: t('dashboard.doctor.todaysAppointments'), value: todays.length, color: 'text-primary-600 dark:text-primary-400' },
    { label: t('dashboard.doctor.pendingConfirmation'), value: pending.length, color: 'text-yellow-600 dark:text-yellow-400' },
    { label: t('dashboard.doctor.totalAppointments'), value: appointments.length, color: 'text-accent-600 dark:text-accent-400' },
    { label: t('dashboard.doctor.uniquePatients'), value: uniquePatients.size, color: 'text-gray-800 dark:text-gray-200' },
  ];

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('dashboard.doctor.welcome')} {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dashboard.doctor.subtitle')}</p>
        </div>
        <Link to="/doctor/appointments" className="btn-primary">
          {t('dashboard.doctor.viewAll')}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card !p-0">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.doctor.todaysAppointments')}</h2>
        </div>
        {todays.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('dashboard.doctor.noAppointmentsToday')}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {[...todays]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((a) => (
                <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{refName(a.patientId)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('dashboard.doctor.at')} {a.time}
                    </p>
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

export default DoctorDashboard;
