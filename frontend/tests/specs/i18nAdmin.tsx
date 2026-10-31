import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../../src/api/adminApi';
import { PermissionPicker } from '../../src/components/admin/PermissionPicker';
import { permissionLabel } from '../../src/components/admin/permissionCatalog';
import { Pagination } from '../../src/components/ui/Pagination';
import { describeAction } from '../../src/lib/format';
import { roleLabel } from '../../src/lib/labels';
import { setLanguage } from '../../src/i18n';
import AdminUserCreatePage from '../../src/pages/admin/AdminUserCreatePage';
import AdminUsersPage from '../../src/pages/admin/AdminUsersPage';
import { adminUser, makeStore, renderWithApp } from '../helpers';

vi.mock('../../src/api/authApi', () => ({ adminLoginApi: vi.fn() }));
vi.mock('../../src/api/adminApi', () => ({
  listUsersApi: vi.fn(),
  createAdminApi: vi.fn(),
  deleteAdminApi: vi.fn(),
  userActionApi: vi.fn(),
  resetAdminPasswordApi: vi.fn(),
}));

const admin = vi.mocked(adminApi);

const SUPER_ADMIN = {
  ...adminUser,
  id: 'sa1',
  name: 'Super Boss',
  role: 'superadmin' as const,
  permissions: [...adminUser.permissions, 'users.read', 'users.manage', 'users.reset_password', 'sessions.revoke'],
};

beforeEach(() => {
  vi.resetAllMocks();
  setLanguage('gu');
});

afterEach(() => setLanguage('en'));

describe('Admin pages in Gujarati', () => {
  it('shows the admin list chrome in Gujarati', async () => {
    admin.listUsersApi.mockResolvedValue({
      users: [
        { id: 'a1', name: 'Nisha Shah', email: 'nisha@example.test', role: 'admin', status: 'active', permissions: ['events.read', 'events.publish'], lastLoginAt: null, suspendedAt: null },
        { id: 'a2', name: 'Ravi Mehta', email: 'ravi@example.test', role: 'admin', status: 'suspended', permissions: [], lastLoginAt: null, suspendedAt: null },
      ],
      totalCount: 2,
    });
    renderWithApp(<AdminUsersPage />, { store: await makeStore(SUPER_ADMIN) });
    await screen.findByText('Nisha Shah');

    expect(screen.getByRole('heading', { name: 'એડમિન' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'એડમિન ઉમેરો' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'એડમિન એકાઉન્ટ' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'એડમિન શોધો' })).toBeInTheDocument();
    expect(screen.getByText('2 પસંદ કરેલ')).toBeInTheDocument();
    expect(screen.getByText('કંઈ નહીં')).toBeInTheDocument();
    expect(screen.getByText('છેલ્લું સાઇન ઇન')).toBeInTheDocument();
    expect(screen.queryByText('Add admin')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nisha Shah માટે ક્રિયાઓ' }));
    const labels = within(screen.getByRole('list', { name: 'Nisha Shah માટે ક્રિયાઓ' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(['સંપાદિત કરો', 'નિષ્ક્રિય કરો…', 'પાસવર્ડ રીસેટ કરો…', 'બધે સાઇન આઉટ કરો', 'કાઢી નાખો']);
  });

  it('translates the confirmation dialog, with the name filled in', async () => {
    admin.listUsersApi.mockResolvedValue({
      users: [{ id: 'a1', name: 'Nisha Shah', email: 'nisha@example.test', role: 'admin', status: 'active', permissions: [], lastLoginAt: null, suspendedAt: null }],
      totalCount: 1,
    });
    renderWithApp(<AdminUsersPage />, { store: await makeStore(SUPER_ADMIN) });
    await screen.findByText('Nisha Shah');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nisha Shah માટે ક્રિયાઓ' }));
    await user.click(screen.getByRole('button', { name: 'બધે સાઇન આઉટ કરો' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('આ એડમિનને બધે સાઇન આઉટ કરવા છે?')).toBeInTheDocument();
    expect(within(dialog).getByText('Nisha Shah ને દરેક ડિવાઇસ પર ફરી સાઇન ઇન કરવું પડશે.')).toBeInTheDocument();
  });

  it('translates client-side validation messages on the Add admin form', async () => {
    renderWithApp(<AdminUserCreatePage />, { store: await makeStore(SUPER_ADMIN) });
    expect(screen.getByRole('heading', { name: 'એડમિન ઉમેરો' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^પાસવર્ડ\s*\*?$/), 'short');
    await user.click(screen.getByRole('button', { name: 'એડમિન બનાવો' }));
    expect(await screen.findByText('પાસવર્ડ ઓછામાં ઓછો 10 અક્ષરનો હોવો જોઈએ')).toBeInTheDocument();
    expect(admin.createAdminApi).not.toHaveBeenCalled();
  });
});

describe('Shared admin pieces in Gujarati', () => {
  it('translates the permission picker, including group labels and placeholders', () => {
    render(<PermissionPicker value={[]} onChange={() => undefined} />);
    expect(screen.getByText('પરવાનગીઓ')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /ડેશબોર્ડ જુઓ/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'સામાન્ય' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'સામાન્ય બધા પસંદ કરો' })).toBeInTheDocument();
    expect(screen.getAllByText(/^1 માંથી 0$/).length).toBeGreaterThan(0);
  });

  it('translates pagination with its page numbers', () => {
    render(<Pagination page={2} pageSize={10} totalCount={35} onChange={() => undefined} />);
    expect(screen.getByRole('navigation', { name: 'પાના' })).toBeInTheDocument();
    expect(screen.getByText('પાનું 2 / 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'પાછળ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'આગળ' })).toBeInTheDocument();
  });

  it('translates audit action names, role labels and permission names at call time', () => {
    expect(describeAction('auth.logout')).toBe('સાઇન આઉટ કર્યું');
    expect(describeAction('event.cancelled')).toBe('કાર્યક્રમ રદ કર્યો');
    expect(roleLabel('superadmin')).toBe('સુપર એડમિન');
    expect(permissionLabel('audit.read')).toBe('ઓડિટ લોગ જુઓ');
    setLanguage('en');
    expect(describeAction('auth.logout')).toBe('Signed out');
    expect(roleLabel('superadmin')).toBe('Super Admin');
    expect(permissionLabel('audit.read')).toBe('View audit log');
  });
});
