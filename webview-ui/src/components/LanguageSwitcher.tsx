import { useState } from 'react';

import { getLocale, setLocale, type Locale } from '../i18n/index.js';
import { useLocale } from '../hooks/useLocale.js';

const options: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ug', label: 'ئۇيغۇرچە' },
];

export function LanguageSwitcher() {
  useLocale(); // re-render on locale change
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {options.map((opt) => {
        const isActive = getLocale() === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setLocale(opt.value)}
            onMouseEnter={() => setHovered(opt.value)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: '2px 8px',
              fontSize: '20px',
              background: isActive
                ? 'rgba(90, 140, 255, 0.25)'
                : hovered === opt.value
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'transparent',
              color: isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.6)',
              border: isActive ? '2px solid #5a8cff' : '2px solid transparent',
              borderRadius: 0,
              cursor: 'pointer',
              direction: opt.value === 'ug' ? 'rtl' : 'ltr',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
