import { useEffect, useState } from 'react';

import { getLocale, onLocaleChange, type Locale } from '../i18n/index.js';

/** React hook that re-renders the component when locale changes. Returns current locale. */
export function useLocale(): Locale {
  const [locale, setLocale] = useState(getLocale);
  useEffect(() => onLocaleChange(() => setLocale(getLocale())), []);
  return locale;
}
