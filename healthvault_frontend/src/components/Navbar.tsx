import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { getNavLinks } from './Sidebar';

const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-red',
  doctor: 'badge-blue',
  patient: 'badge-green',
};

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, toggleLanguage } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const ThemeToggleButton = ({ className = '' }: { className?: string }) => (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? t('toggle.lightMode') : t('toggle.darkMode')}
      className={`rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${className}`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );

  const LanguageToggleButton = ({ className = '' }: { className?: string }) => (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${className}`}
    >
      {t('toggle.language')}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2" onClick={closeMenu}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-lg font-bold text-white">
            +
          </span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            Health<span className="text-accent-500">Vault</span>
          </span>
        </Link>

        {/* Desktop right side */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageToggleButton />
          <ThemeToggleButton />
          {isAuthenticated && user ? (
            <>
              <span className={ROLE_BADGE[user.role] ?? 'badge-gray'}>{t(`role.${user.role}`)}</span>
              <Link
                to="/profile"
                className="text-sm font-medium text-gray-700 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
              >
                {user.name}
              </Link>
              <button type="button" onClick={logout} className="btn-outline !py-1.5">
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-gray-700 hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-400"
              >
                {t('nav.login')}
              </Link>
              <Link to="/register" className="btn-primary !py-1.5">
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <LanguageToggleButton />
          <ThemeToggleButton />
          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t('nav.toggleMenu')}
            aria-expanded={menuOpen}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="space-y-1 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 md:hidden">
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-2 px-2 pb-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{user.name}</span>
                <span className={ROLE_BADGE[user.role] ?? 'badge-gray'}>{t(`role.${user.role}`)}</span>
              </div>
              {getNavLinks(user.role, t).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                to="/profile"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('nav.profile')}
              </NavLink>
              <NavLink
                to="/mfa-setup"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('nav.mfaSecurity')}
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  logout();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                onClick={closeMenu}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30"
              >
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
};

export default Navbar;
