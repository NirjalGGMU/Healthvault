import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const NotFound = () => {
  const { t } = useLanguage();
  return (
    <div className="page flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-extrabold text-primary-600 dark:text-primary-400">404</p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{t('notFound.title')}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">{t('notFound.message')}</p>
      <Link to="/" className="btn-primary mt-8">
        {t('notFound.backHome')}
      </Link>
    </div>
  );
};

export default NotFound;
