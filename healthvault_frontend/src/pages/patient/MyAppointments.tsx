import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import Avatar from '../../components/Avatar';
import { Appointment, refAvatar, refName } from '../../types';
import { formatDate } from '../../utils/auth';
import { exportToCSV, exportToJSON } from '../../utils/export';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-yellow',
  confirmed: 'badge-green',
  cancelled: 'badge-red',
};

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'badge-yellow',
  paid: 'badge-green',
  refunded: 'badge-gray',
  refund_failed: 'badge-red',
};

/** Falls back to '—' for appointments booked before deposits existed / any malformed value, instead of rendering "$NaN". */
const formatDeposit = (amountMinorUnits: number | undefined, currency: string | undefined): string => {
  if (typeof amountMinorUnits !== 'number' || Number.isNaN(amountMinorUnits) || !currency) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(
    amountMinorUnits / 100
  );
};

const MyAppointments = () => {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

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

  // Stripe Checkout redirects back here with ?payment=success|cancelled.
  // The webhook (not this redirect) is the source of truth for paymentStatus,
  // so this just gives the user feedback and re-fetches the current state.
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (!payment) return;

    if (payment === 'success') {
      toast.success(t('appointments.paymentSuccess'));
    } else if (payment === 'cancelled') {
      toast.error(t('appointments.paymentCancelled'));
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('payment');
      next.delete('appointment');
      return next;
    }, { replace: true });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pay = async (id: string) => {
    setPayingId(id);
    try {
      const { data } = await api.post<{ url: string }>(`/appointments/${id}/checkout`);
      window.location.href = data.url;
    } catch (error) {
      toast.error(getErrorMessage(error));
      setPayingId(null);
    }
  };

  const exportRows = () =>
    appointments.map((a) => ({
      doctor: `Dr. ${refName(a.doctorId)}`,
      date: formatDate(a.date),
      time: a.time,
      status: a.status,
      deposit: formatDeposit(a.depositAmount, a.currency),
      paymentStatus: a.paymentStatus,
      notes: a.notes ?? '',
    }));

  useEffect(() => {
    void load();
  }, []);

  const cancel = async (id: string) => {
    if (!window.confirm(t('appointments.confirmCancel'))) return;
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

  if (loading) return <LoadingSpinner fullScreen label={t('loading.appointments')} />;

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('appointments.myTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {appointments.length} {t('appointments.total')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {appointments.length > 0 && (
            <>
              <button type="button" onClick={() => exportToCSV('my-appointments.csv', exportRows())} className="btn-outline">
                {t('common.exportCsv')}
              </button>
              <button
                type="button"
                onClick={() => exportToJSON('my-appointments.json', exportRows())}
                className="btn-outline"
              >
                {t('common.exportJson')}
              </button>
            </>
          )}
          <Link to="/patient/book" className="btn-accent">
            {t('appointments.bookNew')}
          </Link>
        </div>
      </div>

      {appointments.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('appointments.noneYet')}</p>
          <Link to="/patient/book" className="btn-primary mt-4">
            {t('appointments.bookFirst')}
          </Link>
        </div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="table-th">{t('appointments.doctor')}</th>
                <th className="table-th">{t('appointments.date')}</th>
                <th className="table-th">{t('appointments.time')}</th>
                <th className="table-th">{t('common.status')}</th>
                <th className="table-th">{t('appointments.deposit')}</th>
                <th className="table-th">{t('appointments.notes')}</th>
                <th className="table-th text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {appointments.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="table-td font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <Avatar avatarUrl={refAvatar(a.doctorId)} name={refName(a.doctorId)} size="sm" />
                      Dr. {refName(a.doctorId)}
                    </div>
                  </td>
                  <td className="table-td">{formatDate(a.date)}</td>
                  <td className="table-td">{a.time}</td>
                  <td className="table-td">
                    <span className={STATUS_BADGE[a.status] ?? 'badge-gray'}>{t(`status.${a.status}`)}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDeposit(a.depositAmount, a.currency)}
                      </span>
                      <span className={PAYMENT_BADGE[a.paymentStatus] ?? 'badge-gray'}>
                        {t(`payment.${a.paymentStatus}`)}
                      </span>
                    </div>
                  </td>
                  <td className="table-td max-w-[220px] truncate" title={a.notes ?? ''}>
                    {a.notes || <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="table-td text-right">
                    <div className="flex justify-end gap-2">
                      {a.status !== 'cancelled' && a.paymentStatus === 'unpaid' && (
                        <button
                          type="button"
                          onClick={() => pay(a._id)}
                          disabled={payingId === a._id}
                          className="btn-primary !px-3 !py-1.5 !text-xs"
                        >
                          {payingId === a._id ? t('appointments.paying') : t('appointments.payDeposit')}
                        </button>
                      )}
                    </div>
                    {a.status !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => cancel(a._id)}
                        disabled={cancellingId === a._id}
                        className="btn-danger mt-2 !px-3 !py-1.5 !text-xs"
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

export default MyAppointments;
