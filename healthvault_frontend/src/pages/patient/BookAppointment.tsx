import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import Avatar from '../../components/Avatar';
import { DoctorOption } from '../../types';
import { encryptNotes } from '../../utils/encryption';

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30',
];

const todayISO = (): string => new Date().toISOString().split('T')[0];

const BookAppointment = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<{ doctors: DoctorOption[] }>('/users/doctors');
        setDoctors(data.doctors);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoadingDoctors(false);
      }
    };
    void load();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!doctorId) {
      toast.error('Please select a doctor');
      return;
    }
    if (!date) {
      toast.error('Please pick a date');
      return;
    }
    if (date < todayISO()) {
      toast.error('The date cannot be in the past');
      return;
    }
    if (!time) {
      toast.error('Please choose a time slot');
      return;
    }
    if (notes.length > 2000) {
      toast.error('Notes must be at most 2000 characters');
      return;
    }

    setSubmitting(true);
    try {
      const trimmedNotes = notes.trim();
      await api.post('/appointments/book', {
        doctorId,
        date,
        time,
        notes: trimmedNotes ? await encryptNotes(trimmedNotes) : undefined,
      });
      toast.success('Appointment booked!');
      navigate('/patient/appointments');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingDoctors) return <LoadingSpinner fullScreen label={t('loading.doctors')} />;

  return (
    <div className="page mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('book.title')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('book.subtitle')}</p>

      <form onSubmit={handleSubmit} className="card mt-6 space-y-6" noValidate>
        {/* Doctor selection */}
        <div>
          <p className="label">{t('book.selectDoctor')}</p>
          {doctors.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              {t('book.noDoctors')}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {doctors.map((doc) => (
                <button
                  type="button"
                  key={doc._id}
                  onClick={() => setDoctorId(doc._id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    doctorId === doc._id
                      ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-200 dark:bg-primary-900/30 dark:ring-primary-800'
                      : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar avatarUrl={doc.avatarUrl} name={doc.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">Dr. {doc.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{doc.email}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date picker */}
        <div>
          <label htmlFor="date" className="label">{t('book.date')}</label>
          <input
            id="date"
            type="date"
            className="input-field"
            min={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Time slots */}
        <div>
          <p className="label">{t('book.timeSlot')}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TIME_SLOTS.map((slot) => (
              <button
                type="button"
                key={slot}
                onClick={() => setTime(slot)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  time === slot
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-accent-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-accent-400'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="label">
            {t('book.notesLabel')} <span className="font-normal text-gray-400 dark:text-gray-500">{t('book.notesOptionalEncrypted')}</span>
          </label>
          <textarea
            id="notes"
            rows={4}
            maxLength={2000}
            className="input-field resize-none"
            placeholder={t('book.notesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">{notes.length}/2000</p>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting || doctors.length === 0}>
          {submitting ? t('book.booking') : t('book.confirmBooking')}
        </button>
      </form>
    </div>
  );
};

export default BookAppointment;
