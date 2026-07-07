import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { UserRecord, UserRole } from '../../types';
import { formatDate } from '../../utils/auth';
import { exportToCSV, exportToJSON } from '../../utils/export';
import { parseCSVFile } from '../../utils/import';

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-red',
  doctor: 'badge-blue',
  patient: 'badge-green',
};

type RoleFilter = 'all' | UserRole;

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; email?: string; reason: string }[];
}

const ManageUsers = () => {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const { data } = await api.get<{ users: UserRecord[] }>('/users/all');
      setUsers(data.users);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesSearch =
        q.length === 0 || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [users, search, roleFilter]);

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (importInputRef.current) importInputRef.current.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const rows = await parseCSVFile(file);
      const { data } = await api.post<ImportResult>('/users/import', { users: rows });
      toast.success(
        `${t('users.importResult')} ${data.created} ${t('users.importCreated')}, ${data.skipped} ${t('users.importSkipped')}`
      );
      if (data.errors.length > 0) {
        console.warn('Import row errors:', data.errors);
      }
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen label={t('loading.users')} />;

  const exportRows = () =>
    visible.map((u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      mfaEnabled: u.mfaEnabled,
      isLocked: !!u.isLocked,
      lastLogin: u.lastLogin ?? '',
    }));

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('users.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {visible.length} {t('users.shownOf')} {users.length} {t('users.shown')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visible.length > 0 && (
            <>
              <button type="button" onClick={() => exportToCSV('users.csv', exportRows())} className="btn-outline">
                {t('common.exportCsv')}
              </button>
              <button type="button" onClick={() => exportToJSON('users.json', exportRows())} className="btn-outline">
                {t('common.exportJson')}
              </button>
            </>
          )}
          <label htmlFor="import-users" className="btn-accent cursor-pointer">
            {importing ? t('users.importing') : t('users.importCsv')}
          </label>
          <input
            id="import-users"
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImport}
            disabled={importing}
          />
        </div>
      </div>
      <p className="-mt-4 text-xs text-gray-400 dark:text-gray-500">{t('users.importFormatHint')}</p>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          className="input-field sm:max-w-xs"
          placeholder={t('users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
        />
        <select
          className="input-field sm:max-w-[180px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          aria-label={t('common.role')}
        >
          <option value="all">{t('users.allRoles')}</option>
          <option value="admin">{t('users.admins')}</option>
          <option value="doctor">{t('users.doctors')}</option>
          <option value="patient">{t('users.patients')}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card py-12 text-center text-gray-500 dark:text-gray-400">{t('users.noneMatch')}</div>
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="table-th">{t('common.name')}</th>
                <th className="table-th">{t('common.email')}</th>
                <th className="table-th">{t('common.role')}</th>
                <th className="table-th">{t('users.mfa')}</th>
                <th className="table-th">{t('common.status')}</th>
                <th className="table-th">{t('users.lastLogin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {visible.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="table-td font-medium text-gray-900 dark:text-white">{u.name}</td>
                  <td className="table-td">{u.email}</td>
                  <td className="table-td">
                    <span className={ROLE_BADGE[u.role] ?? 'badge-gray'}>{t(`role.${u.role}`)}</span>
                  </td>
                  <td className="table-td">
                    {u.mfaEnabled ? (
                      <span className="badge-green">{t('users.mfaOn')}</span>
                    ) : (
                      <span className="badge-gray">{t('users.mfaOff')}</span>
                    )}
                  </td>
                  <td className="table-td">
                    {u.isLocked ? (
                      <span className="badge-red">{t('users.locked')}</span>
                    ) : (
                      <span className="badge-green">{t('users.active')}</span>
                    )}
                  </td>
                  <td className="table-td">
                    {u.lastLogin ? formatDate(u.lastLogin) : <span className="text-gray-300 dark:text-gray-600">{t('common.never')}</span>}
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

export default ManageUsers;
