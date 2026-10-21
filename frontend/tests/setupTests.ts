import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-pref');
});

// jsdom has no matchMedia. Tests set `window.__prefersDark` to simulate the OS setting.
declare global {
  interface Window {
    __prefersDark?: boolean;
  }
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? Boolean(window.__prefersDark) : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }),
});

// jsdom does not implement scrolling; the app scrolls to the top on every page change.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// jsdom does not implement the modal <dialog> methods that Modal relies on. This mirrors the
// parts of the platform behaviour the app uses: `open` toggles and `close` fires once when closing.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
