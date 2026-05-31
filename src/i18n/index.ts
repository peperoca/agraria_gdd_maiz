import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';

// Determine default language: check localStorage first, then default based on context
function getDefaultLanguage(): string {
  const saved = localStorage.getItem('corn-gdd-lang');
  if (saved) return saved;
  return 'es'; // Spanish default for all users; admin override happens at login
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: getDefaultLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;

/**
 * Set language and persist to localStorage.
 * Call this from the gear menu toggle or after login for admin users.
 */
export function setLanguage(lang: 'en' | 'es'): void {
  localStorage.setItem('corn-gdd-lang', lang);
  i18n.changeLanguage(lang);
}

/**
 * Set default language for admin users who haven't chosen yet.
 * Called after login when user.role === 'admin' and no saved preference.
 */
export function setAdminDefault(): void {
  if (!localStorage.getItem('corn-gdd-lang')) {
    setLanguage('en');
  }
}
