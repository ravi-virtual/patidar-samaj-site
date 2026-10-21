import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createStore } from '../../src/store';
import { ThemeToggle } from '../../src/components/ui/ThemeToggle';
import { useThemeEffect } from '../../src/hooks/useThemeEffect';
import { applyTheme, readStoredTheme, resolveTheme } from '../../src/utils/theme';

function Harness() {
  useThemeEffect();
  return <ThemeToggle />;
}

const renderToggle = () =>
  render(
    <Provider store={createStore()}>
      <Harness />
    </Provider>,
  );

describe('theme utilities', () => {
  it('uses the system preference when nothing is saved', () => {
    window.__prefersDark = true;
    expect(readStoredTheme()).toBe('system');
    expect(resolveTheme('system')).toBe('dark');
    window.__prefersDark = false;
    expect(resolveTheme('system')).toBe('light');
  });

  it('lets an explicit choice override the system preference', () => {
    window.__prefersDark = true;
    expect(resolveTheme('light')).toBe('light');
    window.__prefersDark = false;
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('ignores garbage in storage', () => {
    window.localStorage.setItem('samaj.theme', 'neon');
    expect(readStoredTheme()).toBe('system');
  });

  it('applies the resolved theme to <html>', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-theme-pref', 'dark');
  });
});

describe('<ThemeToggle />', () => {
  it('exposes Light, Dark and System as a labelled radio group', () => {
    renderToggle();
    expect(screen.getByRole('group', { name: /colour theme/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
  });

  it('starts on System with no stored preference', () => {
    renderToggle();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('switches the page theme and remembers the choice locally for anonymous visitors', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('samaj.theme')).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('samaj.theme')).toBe('light');
  });

  it('is operable with the keyboard', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
