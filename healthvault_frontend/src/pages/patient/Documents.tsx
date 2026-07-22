import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '../../api/axios';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { VaultDocument } from '../../types';
import { formatDate } from '../../utils/auth';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Documents = () => {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const { data } = await api.get<{ documents: VaultDocument[] }>('/documents');
      setDocuments(data.documents);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error(t('documents.invalidType'));
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(t('documents.tooLarge'));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/documents', formData);
      toast.success(t('documents.uploadSuccess'));
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: VaultDocument) => {
    setBusyId(doc._id);
    try {
      const response = await api.get(`/documents/${doc._id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc: VaultDocument) => {
    if (!window.confirm(t('documents.confirmDelete'))) return;
    setBusyId(doc._id);
    try {
      await api.delete(`/documents/${doc._id}`);
      toast.success(t('documents.deleteSuccess'));
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingSpinner fullScreen label={t('loading.documents')} />;

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('documents.title')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('documents.subtitle')}</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            id="vault-file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <label htmlFor="vault-file" className={`btn-accent cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
            {uploading ? t('documents.uploading') : t('documents.upload')}
          </label>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">{t('documents.emptyState')}</p>
          <label htmlFor="vault-file" className="btn-primary mt-4 inline-block cursor-pointer">
            {t('documents.uploadFirst')}
          </label>
        </div>
      ) : (
        <div className="card !p-0">
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {documents.map((doc) => (
              <li key={doc._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{doc.originalName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>{formatDate(doc.createdAt)}</span>
                    <span>·</span>
                    <span>{formatFileSize(doc.size)}</span>
                    <span>·</span>
                    <span>🔒 {t('documents.encryptedAtRest')}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={busyId === doc._id}
                    className="btn-outline !px-3 !py-1.5 !text-xs"
                  >
                    {t('documents.download')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc._id}
                    className="btn-danger !px-3 !py-1.5 !text-xs"
                  >
                    {t('documents.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 dark:text-gray-500">
        <Link to="/patient" className="hover:underline">
          {t('documents.backToDashboard')}
        </Link>
      </p>
    </div>
  );
};

export default Documents;
