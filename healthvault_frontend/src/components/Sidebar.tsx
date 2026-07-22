import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserRole } from '../types';

export interface NavItem {
  label: string;
  to: string;
  end?: boolean;
}

/** Role-based navigation, shared by Sidebar (desktop) and Navbar (mobile menu) */
export const getNavLinks = (role: UserRole, t: (key: string) => string): NavItem[] => {
  switch (role) {
    case 'patient':
      return [
        { label: t('nav.dashboard'), to: '/patient', end: true },
        { label: t('nav.bookAppointment'), to: '/patient/book' },
        { label: t('nav.myAppointments'), to: '/patient/appointments' },
        { label: t('nav.documents'), to: '/patient/documents' },
      ];
    case 'doctor':
      return [
        { label: t('nav.dashboard'), to: '/doctor', end: true },
        { label: t('nav.appointments'), to: '/doctor/appointments' },
      ];
    case 'admin':
      return [
        { label: t('nav.dashboard'), to: '/admin', end: true },
        { label: t('nav.manageUsers'), to: '/admin/users' },
        { label: t('nav.allAppointments'), to: '/admin/appointments' },
      ];
  }
};

const linkClasses = (isActive: boolean): string =>
  `block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'border-l-4 border-primary-600 bg-primary-50 pl-3 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
  }`;

const Sidebar = () => {
  const { user } = useAuth();
  const { t } = useLanguage();

  if (!user) return null;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:block">
      <nav className="sticky top-16 space-y-1 p-4">
        <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t(`role.${user.role}`)} {t('nav.menuSuffix')}
        </p>
        {getNavLinks(user.role, t).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => linkClasses(isActive)}
          >
            {item.label}
          </NavLink>
        ))}

        <div className="pt-4">
          <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t('nav.account')}
          </p>
          <NavLink to="/profile" className={({ isActive }) => linkClasses(isActive)}>
            {t('nav.profile')}
          </NavLink>
          <NavLink to="/mfa-setup" className={({ isActive }) => linkClasses(isActive)}>
            {t('nav.mfaSecurity')}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
