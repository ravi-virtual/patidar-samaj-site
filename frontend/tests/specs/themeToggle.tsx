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
  it('is a single icon button that offers the opposite mode', async () => {
    const user = userEvent.setup();
    renderToggle();
    // The portal starts light, so the button offers dark mode.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    // Now dark, so it offers light mode.
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch to dark mode' })).not.toBeInTheDocument();
  });

  it('switches the page theme and remembers the choice locally for anonymous visitors', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('samaj.theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('samaj.theme')).toBe('light');
  });

  it('is operable with the keyboard', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});
