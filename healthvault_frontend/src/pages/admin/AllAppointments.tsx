import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Appointment, AppointmentStatus, refEmail, refName } from '../../types';
import { formatDate } from '../../utils/auth';
import { exportToCSV, exportToJSON } from '../../utils/export';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

type StatusFilter = 'all' | AppointmentStatus;

const AllAppointments = () => {
  const { t } = useLanguage();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
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

  const cancel = async (id: string) => {
    if (!window.confirm(t('adminAppointments.confirmCancel'))) return;
    setCancellingId(id);
    try {
      await api.put(`/appointments/${id}/cancel`);
      toast.success('Appointment cancelled');
      setAppointments((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: 'cancelled' } : a))
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCancellingId(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments.filter((a) => {
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchesSearch =
        q.length === 0 ||
        refName(a.patientId).toLowerCase().includes(q) ||
        refName(a.doctorId).toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [appointments, search, statusFilter]);

  if (loading) return <LoadingSpinner fullScreen label={t('loading.appointments')} />;

  const exportRows = () =>
    visible.map((a) => ({
      patient: refName(a.patientId),
      doctor: `Dr. ${refName(a.doctorId)}`,
      email: refEmail(a.patientId),
      date: formatDate(a.date),
      time: a.time,
      status: a.status,
      notes: a.notes ?? '',
    }));

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('adminAppointments.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {visible.length} {t('doctorAppointments.shownOf')} {appointments.length} {t('doctorAppointments.shown')}
          </p>
        </div>
        {visible.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportToCSV('all-appointments.csv', exportRows())}
              className="btn-outline"
            >
              {t('common.exportCsv')}
            </button>
            <button
              type="button"
              onClick={() => exportToJSON('all-appointments.json', exportRows())}
              className="btn-outline"
            >
              {t('common.exportJson')}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          className="input-field sm:max-w-xs"
          placeholder={t('adminAppointments.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
        />
        <select
          className="input-field sm:max-w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label={t('doctorAppointments.filterStatus')}
        >
          <option value="all">{t('doctorAppointments.allStatuses')}</option>
          <option value="pending">{t('status.pending')}</option>
          <option value="confirmed">{t('status.confirmed')}</option>
          <option value="cancelled">{t('status.cancelled')}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card py-12 text-center text-gray-500 dark:text-gray-400">{t('adminAppointments.noneMatch')}</div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="table-th">{t('appointments.patient')}</th>
                <th className="table-th">{t('appointments.doctor')}</th>
                <th className="table-th">{t('adminAppointments.contact')}</th>
                <th className="table-th">{t('appointments.date')}</th>
                <th className="table-th">{t('appointments.time')}</th>
                <th className="table-th">{t('common.status')}</th>
                <th className="table-th text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {visible.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="table-td font-medium text-gray-900 dark:text-white">{refName(a.patientId)}</td>
                  <td className="table-td">Dr. {refName(a.doctorId)}</td>
                  <td className="table-td">{refEmail(a.patientId)}</td>
                  <td className="table-td">{formatDate(a.date)}</td>
                  <td className="table-td">{a.time}</td>
                  <td className="table-td">
                    <span className={STATUS_BADGE[a.status] ?? 'badge-gray'}>{t(`status.${a.status}`)}</span>
                  </td>
                  <td className="table-td text-right">
                    {a.status !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => cancel(a._id)}
                        disabled={cancellingId === a._id}
                        className="btn-danger !px-3 !py-1.5 !text-xs"
                      >
                        {cancellingId === a._id ? t('appointments.cancelling') : t('appointments.cancel')}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AllAppointments;
