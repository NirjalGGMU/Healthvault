import { ReactNode, createContext, useContext, useState } from 'react';
import { Language, translations } from '../i18n/translations';

const LANGUAGE_KEY = 'hv_language';

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const getInitialLanguage = (): Language => {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  return stored === 'ne' ? 'ne' : 'en';
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'ne' : 'en';
      localStorage.setItem(LANGUAGE_KEY, next);
      return next;
    });
  };

  const t = (key: string): string => translations[language][key] ?? translations.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
