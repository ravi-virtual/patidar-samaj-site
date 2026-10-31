import { afterEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageToggle } from '../../src/components/ui/LanguageToggle';
import { getLanguage, setLanguage, t, useLanguage } from '../../src/i18n';
import { formatMediumDate } from '../../src/lib/format';

function Greeting() {
  const language = useLanguage();
  return <p>{`${language}:${t('Search')}`}</p>;
}

afterEach(() => setLanguage('en'));

describe('<LanguageToggle />', () => {
  it('is a single button that offers the other language', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LanguageToggle />
        <Greeting />
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('en:Search')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to Gujarati' }));
    expect(getLanguage()).toBe('gu');
    expect(document.documentElement).toHaveAttribute('lang', 'gu');
    expect(window.localStorage.getItem('samaj.language')).toBe('gu');
    expect(screen.getByText('gu:શોધો')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'અંગ્રેજી પર જાઓ' }));
    expect(getLanguage()).toBe('en');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
  });
});

describe('t()', () => {
  it('falls back to English for unknown text and fills placeholders', () => {
    setLanguage('gu');
    expect(t('A sentence nobody has translated')).toBe('A sentence nobody has translated');
    expect(t('Hello {name}', { name: 'Asha' })).toBe('Hello Asha');
  });

  it('formats dates in the active language', () => {
    const en = formatMediumDate('2026-01-15T00:00:00Z');
    setLanguage('gu');
    expect(formatMediumDate('2026-01-15T00:00:00Z')).not.toBe(en);
  });
});
