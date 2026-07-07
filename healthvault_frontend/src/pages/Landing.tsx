import { Link } from 'react-router-dom';
import { roleHome, useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const Landing = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();

  const FEATURES = [
    { titleKey: 'landing.feature1Title', textKey: 'landing.feature1Text' },
    { titleKey: 'landing.feature2Title', textKey: 'landing.feature2Text' },
    { titleKey: 'landing.feature3Title', textKey: 'landing.feature3Text' },
    { titleKey: 'landing.feature4Title', textKey: 'landing.feature4Text' },
  ];

  const STEPS = [
    { step: '1', titleKey: 'landing.step1Title', textKey: 'landing.step1Text' },
    { step: '2', titleKey: 'landing.step2Title', textKey: 'landing.step2Text' },
    { step: '3', titleKey: 'landing.step3Title', textKey: 'landing.step3Text' },
  ];

  return (
    <div className="page">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-700 via-primary-600 to-accent-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="badge bg-white/15 text-white">{t('landing.badge')}</span>
          <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl md:text-5xl">
            {t('landing.heroTitle')} <span className="text-accent-200">{t('landing.heroTitleHighlight')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-primary-100 sm:text-lg">
            {t('landing.heroSubtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {isAuthenticated && user ? (
              <Link to={roleHome(user.role)} className="btn bg-white text-primary-700 hover:bg-primary-50">
                {t('landing.goToDashboard')}
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn bg-white text-primary-700 hover:bg-primary-50">
                  {t('landing.createFreeAccount')}
                </Link>
                <Link to="/login" className="btn border border-white/40 text-white hover:bg-white/10">
                  {t('landing.signIn')}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          {t('landing.whyTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-500 dark:text-gray-400">
          {t('landing.whySubtitle')}
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.titleKey} className="card hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-100 text-lg font-bold text-accent-600 dark:bg-accent-900/40 dark:text-accent-400">
                ✓
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t(f.titleKey)}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t(f.textKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-14 dark:bg-gray-800 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            {t('landing.howItWorks')}
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">
                  {s.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{t(s.titleKey)}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t(s.textKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20">
        <div className="card bg-gradient-to-r from-primary-600 to-accent-600 !border-0 py-12 text-white">
          <h2 className="text-2xl font-bold sm:text-3xl">{t('landing.ctaTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-100">{t('landing.ctaSubtitle')}</p>
          <div className="mt-8">
            {isAuthenticated && user ? (
              <Link to={roleHome(user.role)} className="btn bg-white text-primary-700 hover:bg-primary-50">
                {t('landing.openDashboard')}
              </Link>
            ) : (
              <Link to="/register" className="btn bg-white text-primary-700 hover:bg-primary-50">
                {t('landing.getStartedNow')}
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500">
        {t('landing.footer')}
      </footer>
    </div>
  );
};

export default Landing;
