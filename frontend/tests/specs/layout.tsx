import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from '../../src/store';
import { routes } from '../../src/routes';

function TestApp() {
  return useRoutes(routes);
}

const renderAt = (path: string) =>
  render(
    <Provider store={createStore()}>
      <MemoryRouter initialEntries={[path]}>
        <TestApp />
      </MemoryRouter>
    </Provider>,
  );

describe('public layout', () => {
  it('provides a skip link, landmarks and a labelled main navigation', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('marks the current page in the navigation', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a loading state, then an actionable error when the API is unreachable', async () => {
    renderAt('/');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot reach the server/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('opens and closes the mobile menu with the keyboard', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const opener = screen.getByRole('button', { name: /open menu/i });
    expect(opener).toHaveAttribute('aria-expanded', 'false');

    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
