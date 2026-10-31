import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import * as adminApi from '../../src/api/adminApi';
import { DataTable, type Column } from '../../src/components/admin/DataTable';
import { ActionMenu } from '../../src/components/admin/ActionMenu';
import { RowMenu } from '../../src/components/admin/RowActions';
import { PermissionPicker } from '../../src/components/admin/PermissionPicker';
import { Route, Routes } from 'react-router-dom';
import AdminUserEditPage from '../../src/pages/admin/AdminUserEditPage';
import { Breadcrumbs } from '../../src/components/ui/Breadcrumbs';
import AdminUsersPage from '../../src/pages/admin/AdminUsersPage';
import AdminMembersPage from '../../src/pages/admin/AdminMembersPage';
import AdminUserCreatePage from '../../src/pages/admin/AdminUserCreatePage';
import { ContactDrawer } from '../../src/components/admin/ContactDrawer';
import { useCan, useCanAny } from '../../src/components/admin/usePermissions';
import { ConfirmDialog } from '../../src/components/overlays/ConfirmDialog';
import { apiError, makeStore, adminUser, renderWithApp } from '../helpers';

vi.mock('../../src/api/authApi', () => ({ adminLoginApi: vi.fn() }));
vi.mock('../../src/api/adminApi', () => ({
  listUsersApi: vi.fn(),
  createAdminApi: vi.fn(),
  updateAdminApi: vi.fn(),
  getAdminApi: vi.fn(),
  deleteAdminApi: vi.fn(),
  userActionApi: vi.fn(),
  resetAdminPasswordApi: vi.fn(),
  listStaffMembersApi: vi.fn(),
  createMemberApi: vi.fn(),
  updateMemberApi: vi.fn(),
  anonymizeMemberApi: vi.fn(),
  downloadCsv: vi.fn(),
  getContactApi: vi.fn(),
  updateContactApi: vi.fn(),
  addContactNoteApi: vi.fn(),
}));

const admin = vi.mocked(adminApi);

beforeEach(() => {
  vi.resetAllMocks();
});

interface Row {
  id: string;
  name: string;
}
const columns: Column<Row>[] = [
  { header: 'Name', cell: (r) => r.name },
  { header: 'Actions', srOnlyHeader: true, cell: (r) => <button type="button">Edit {r.name}</button> },
];

describe('DataTable', () => {
  const props = { caption: 'People', columns, rowKey: (r: Row) => r.id };

  it('renders a real table with a caption, column headers and one row per item', () => {
    render(<DataTable {...props} rows={[{ id: '1', name: 'Asha' }, { id: '2', name: 'Ravi' }]} />);
    const table = screen.getByRole('table', { name: 'People' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Actions']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Edit Ravi' })).toBeInTheDocument();
    // the action column header is visually hidden but stays for screen readers
    expect(screen.getByText('Actions')).toHaveClass('sr-only');
  });

  it('shows a loading skeleton, not an empty state, before the first answer', () => {
    render(<DataTable {...props} rows={undefined} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('shows the default or a custom empty state', () => {
    const { unmount } = render(<DataTable {...props} rows={[]} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    unmount();
    render(<DataTable {...props} rows={[]} empty={<p>No people match.</p>} />);
    expect(screen.getByText('No people match.')).toBeInTheDocument();
  });

  it('shows an error with retry when there is nothing to show', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<DataTable {...props} rows={undefined} error="Could not load people" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load people');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the old rows (dimmed) when a refresh fails or is loading', () => {
    const { container, rerender } = render(<DataTable {...props} rows={[{ id: '1', name: 'Asha' }]} loading />);
    expect(container.firstElementChild).toHaveClass('opacity-60');
    rerender(<DataTable {...props} rows={[{ id: '1', name: 'Asha' }]} error="Refresh failed" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('RowMenu', () => {
  it('shows direct Edit and Delete icon buttons when there are no other actions', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<RowMenu name="Welcome" actions={[{ label: 'Edit', kind: 'edit', onSelect: onEdit }, { label: 'Delete', kind: 'delete', onSelect: vi.fn(), show: false }, { label: 'Publish', onSelect: vi.fn(), show: false }]} />);
    expect(screen.queryByRole('button', { name: 'Actions for Welcome' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Welcome' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Welcome' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu with fixed Edit and Delete labels when other actions exist', async () => {
    const user = userEvent.setup();
    render(<RowMenu name="Welcome" actions={[{ label: 'Write', kind: 'edit', onSelect: vi.fn() }, { label: 'Publish', onSelect: vi.fn() }, { label: 'Remove', kind: 'delete', onSelect: vi.fn() }]} />);
    await user.click(screen.getByRole('button', { name: 'Actions for Welcome' }));
    expect(within(screen.getByRole('list', { name: 'Actions for Welcome' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Publish', 'Delete']);
  });
});

describe('ActionMenu', () => {
  it('opens on click, runs the chosen action once, and closes', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ActionMenu label="Actions for Asha" actions={[{ label: 'Edit', onSelect: onEdit }, { label: 'Delete', onSelect: vi.fn(), danger: true }]} />);
    const trigger = screen.getByRole('button', { name: 'Actions for Asha' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('list', { name: 'Actions for Asha' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Delete']);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('text-danger');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('hides actions marked show=false and renders nothing when none remain', () => {
    const { container, rerender } = render(
      <ActionMenu label="Row" actions={[{ label: 'Publish', onSelect: vi.fn(), show: false }, { label: 'View', onSelect: vi.fn() }]} />,
    );
    expect(screen.getByRole('button', { name: 'Row' })).toBeInTheDocument();
    rerender(<ActionMenu label="Row" actions={[{ label: 'Publish', onSelect: vi.fn(), show: false }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('closes on Escape (returning focus to the trigger) and on an outside click', async () => {
    const user = userEvent.setup();
    render(<><ActionMenu label="Row" actions={[{ label: 'View', onSelect: vi.fn() }]} /><p>elsewhere</p></>);
    const trigger = screen.getByRole('button', { name: 'Row' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('toggles closed when the trigger is clicked again', async () => {
    const user = userEvent.setup();
    render(<ActionMenu label="Row" actions={[{ label: 'View', onSelect: vi.fn() }]} />);
    await user.click(screen.getByRole('button', { name: 'Row' }));
    await user.click(screen.getByRole('button', { name: 'Row' }));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('permission-dependent actions', () => {
  function Probe() {
    const can = useCan();
    const canAny = useCanAny();
    return (
      <ActionMenu
        label="Event actions"
        actions={[
          { label: 'Publish', onSelect: vi.fn(), show: can('events.publish') },
          { label: 'Delete', onSelect: vi.fn(), show: can('events.delete', 'events.publish') },
          { label: 'Export', onSelect: vi.fn(), show: canAny('events.export', 'members.export') },
          { label: 'View', onSelect: vi.fn() },
        ]}
      />
    );
  }
  const labelsFor = async (permissions: string[] | null) => {
    const store = await makeStore(permissions ? { ...adminUser, permissions } : null);
    const user = userEvent.setup();
    renderWithApp(<Probe />, { store });
    await user.click(screen.getByRole('button', { name: 'Event actions' }));
    return within(screen.getByRole('list')).getAllByRole('button').map((b) => b.textContent);
  };

  it('shows only the actions the signed-in user holds permissions for', async () => {
    expect(await labelsFor(['events.publish', 'members.export'])).toEqual(['Publish', 'Export', 'View']);
  });

  it('requires every permission for can() and any one for canAny()', async () => {
    expect(await labelsFor(['events.delete'])).toEqual(['View']);
  });

  it('shows no gated actions to a visitor', async () => {
    expect(await labelsFor(null)).toEqual(['View']);
  });
});

describe('ConfirmDialog', () => {
  const setup = (over: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Delete event?" confirmLabel="Delete" tone="danger" onConfirm={onConfirm} onCancel={onCancel} {...over}>
        This cannot be undone.
      </ConfirmDialog>,
    );
    return { onConfirm, onCancel, user: userEvent.setup() };
  };

  it('is an alertdialog named by its title with the cancel button first', () => {
    setup();
    const dialog = screen.getByRole('alertdialog', { name: 'Delete event?' });
    expect(dialog).toHaveTextContent('This cannot be undone.');
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Delete'));
  });

  it('does nothing until the user chooses', async () => {
    const { onConfirm, onCancel, user } = setup();
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels from the Cancel button and the close icon', async () => {
    const { onCancel, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('disables Cancel while the action is busy', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders nothing visible when closed', () => {
    setup({ open: false });
    expect(screen.queryByText('Delete event?')).not.toBeInTheDocument();
  });
});

const SA_USER = {
  ...adminUser,
  id: 'sa1',
  name: 'Super Boss',
  role: 'superadmin' as const,
  permissions: [...adminUser.permissions, 'users.read', 'users.manage', 'users.reset_password', 'sessions.revoke'],
};

describe('PermissionPicker', () => {
  function Host({ initial = [] as string[] }) {
    const [value, setValue] = useState<string[]>(initial);
    return (
      <>
        <PermissionPicker value={value} onChange={setValue} />
        <output aria-label="selected">{[...value].sort().join(',')}</output>
      </>
    );
  }
  const selected = () => screen.getByLabelText('selected').textContent;

  it('offers plain, enabled checkboxes grouped by area, with nothing locked or pre-ticked', () => {
    render(<Host />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(20);
    for (const box of boxes) {
      expect(box).toBeEnabled();
      expect(box).not.toBeChecked();
    }
    for (const area of ['General', 'Members', 'Events', 'Announcements', 'Content & media', 'Contacts', 'Settings & audit']) {
      expect(screen.getByRole('region', { name: area })).toBeInTheDocument();
    }
    expect(screen.queryByText(/included in role|can be granted|not available/i)).not.toBeInTheDocument();
  });

  it('never offers account, role, session or security management, nor removed registration permissions', () => {
    render(<Host />);
    expect(screen.queryByRole('checkbox', { name: /admin accounts|staff accounts|password reset|sign users out|change roles|security|approve|suspend|register|rsvp/i })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /view dashboard/i })).toBeInTheDocument();
  });

  it('ticks and unticks one permission at a time', async () => {
    const user = userEvent.setup();
    render(<Host initial={['events.read']} />);
    expect(screen.getByRole('checkbox', { name: /view events/i })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /publish events/i }));
    expect(selected()).toBe('events.publish,events.read');
    await user.click(screen.getByRole('checkbox', { name: /view events/i }));
    expect(selected()).toBe('events.publish');
  });

  it('has Select all and Clear for each group, leaving other groups alone', async () => {
    const user = userEvent.setup();
    render(<Host initial={['members.read', 'content.read']} />);
    await user.click(screen.getByRole('button', { name: 'Select all Events' }));
    expect(selected()).toBe('content.read,events.create,events.delete,events.publish,events.read,events.update,members.read');
    await user.click(screen.getByRole('button', { name: 'Clear Events' }));
    expect(selected()).toBe('content.read,members.read');
    await user.click(screen.getByRole('button', { name: 'Clear Members' }));
    expect(selected()).toBe('content.read');
  });
});

describe('Add admin page', () => {
  const setup = async () => {
    const store = await makeStore(SA_USER);
    renderWithApp(<AdminUserCreatePage />, { store });
    return userEvent.setup();
  };
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/full name/i), 'New Admin');
    await user.type(screen.getByLabelText(/^email/i), 'admin@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'Welcome-2026-x');
  };
  const created = { user: { name: 'New Admin', email: 'admin@example.test' } as adminApi.AdminUser, email: { delivered: true } };

  it('is a full page that asks for name, email, password and permissions: no role choice', async () => {
    await setup();
    expect(screen.getByRole('heading', { name: 'Add admin' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Permissions' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(10);
  });

  it('validates locally and does not call the API', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 10 characters')).toBeInTheDocument();
    expect(admin.createAdminApi).not.toHaveBeenCalled();
  });

  it('generates a password that satisfies the rules', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Generate a password' }));
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    const value = (screen.getByLabelText(/^password/i) as HTMLInputElement).value;
    expect(value.length).toBeGreaterThanOrEqual(10);
    expect(value).toMatch(/[A-Za-z]/);
    expect(value).toMatch(/\d/);
  });

  it('creates the admin with no permissions by default', async () => {
    admin.createAdminApi.mockResolvedValue(created);
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    await waitFor(() =>
      expect(admin.createAdminApi).toHaveBeenCalledWith({ name: 'New Admin', email: 'admin@example.test', password: 'Welcome-2026-x', permissions: [] }),
    );
  });

  it('sends exactly the ticked permissions', async () => {
    admin.createAdminApi.mockResolvedValue(created);
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole('checkbox', { name: /publish events/i }));
    await user.click(screen.getByRole('button', { name: 'Select all Contacts' }));
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    await waitFor(() =>
      expect(admin.createAdminApi).toHaveBeenCalledWith({
        name: 'New Admin',
        email: 'admin@example.test',
        password: 'Welcome-2026-x',
        permissions: expect.arrayContaining(['events.publish', 'contacts.read', 'contacts.assign', 'contacts.resolve']),
      }),
    );
    expect(vi.mocked(admin.createAdminApi).mock.calls[0]![0].permissions).toHaveLength(4);
  });

  it('shows a server field error under the field', async () => {
    admin.createAdminApi.mockRejectedValue(
      apiError(409, 'Duplicate', 'DUPLICATE_ERROR', [{ field: 'email', message: 'An account with this email already exists' }]),
    );
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows an unmapped server error as a general alert, ignoring unknown field names', async () => {
    admin.createAdminApi.mockRejectedValue(
      apiError(403, 'Only the Super Admin can do this', 'FORBIDDEN', [{ field: 'nonexistent', message: 'ignored' }]),
    );
    const user = await setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create admin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the Super Admin can do this');
  });
});

describe('Edit admin page', () => {
  const target: adminApi.AdminUser = {
    id: 'a1',
    name: 'Nisha Shah',
    email: 'nisha@example.test',
    role: 'admin',
    status: 'active',
    permissions: ['events.read'],
    lastLoginAt: null,
    suspendedAt: null,
  };
  const open = async () => {
    admin.getAdminApi.mockResolvedValue(target);
    const store = await makeStore(SA_USER);
    renderWithApp(
      <Routes>
        <Route path="/admin/users/:id/edit" element={<AdminUserEditPage />} />
        <Route path="/admin/users" element={<p>Admins list page</p>} />
      </Routes>,
      { store, path: '/admin/users/a1/edit' },
    );
    await screen.findByLabelText(/full name/i);
    return userEvent.setup();
  };

  it('is a page that starts from the admin’s name and ticked permissions and saves only name and permissions', async () => {
    admin.updateAdminApi.mockResolvedValue(target);
    const user = await open();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Nisha Shah');
    expect(screen.getByRole('checkbox', { name: /view events/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /publish events/i })).not.toBeChecked();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/full name/i));
    await user.type(screen.getByLabelText(/full name/i), 'Nisha S. Shah');
    await user.click(screen.getByRole('checkbox', { name: /publish events/i }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(admin.updateAdminApi).toHaveBeenCalledWith('a1', { name: 'Nisha S. Shah', permissions: ['events.read', 'events.publish'] }));
    expect(await screen.findByText('Admins list page')).toBeInTheDocument();
  });

  it('shows the server error and stays on the page when saving fails', async () => {
    admin.updateAdminApi.mockRejectedValue(apiError(403, 'Only the Super Admin can do this'));
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the Super Admin can do this');
    expect(screen.queryByText('Admins list page')).not.toBeInTheDocument();
  });
});

describe('Breadcrumbs', () => {
  it('links earlier levels and marks the last one as the current page', () => {
    renderWithApp(<Breadcrumbs crumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Admins', to: '/admin/users' }, { label: 'Create admin' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(within(nav).getByRole('link', { name: 'Admins' })).toHaveAttribute('href', '/admin/users');
    expect(within(nav).getByText('Create admin')).toHaveAttribute('aria-current', 'page');
  });
});

describe('Users page (Super Admin manages admins)', () => {
  const rows: adminApi.AdminUser[] = [
    { id: 'a1', name: 'Nisha Shah', email: 'nisha@example.test', role: 'admin', status: 'active', permissions: ['events.read', 'events.publish'], lastLoginAt: null, suspendedAt: null },
    { id: 'a2', name: 'Ravi Mehta', email: 'ravi@example.test', role: 'admin', status: 'suspended', permissions: [], lastLoginAt: '2030-01-01T10:00:00.000Z', suspendedAt: '2030-01-02T10:00:00.000Z' },
  ];
  const open = async () => {
    admin.listUsersApi.mockResolvedValue({ users: rows, totalCount: 2 });
    const store = await makeStore(SA_USER);
    renderWithApp(<AdminUsersPage />, { store });
    await screen.findByText('Nisha Shah');
    return userEvent.setup();
  };
  const menuLabels = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    return within(screen.getByRole('list', { name: `Actions for ${name}` })).getAllByRole('button').map((b) => b.textContent);
  };

  it('lists admins with their permission count and an "Add admin" button', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Admins' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add admin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add staff/i })).not.toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /permission matrix/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/change role/i)).not.toBeInTheDocument();
  });

  it('has no role filter, only a status filter', async () => {
    await open();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('uses the row-menu convention: Edit (pencil) and Delete (trash) with the other actions in the ⋯ menu', async () => {
    const user = await open();
    expect(await menuLabels(user, 'Nisha Shah')).toEqual(['Edit', 'Mark inactive…', 'Reset password…', 'Sign out everywhere', 'Delete']);
    await user.keyboard('{Escape}');
    expect(await menuLabels(user, 'Ravi Mehta')).toEqual(['Edit', 'Mark active', 'Sign out everywhere', 'Delete']);
  });

  it('opens the edit page from Edit', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Actions for Nisha Shah' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes only after confirmation, explaining that the email stays reserved', async () => {
    admin.deleteAdminApi.mockResolvedValue();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Actions for Nisha Shah' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this admin?' });
    expect(dialog).toHaveTextContent(/email address stays reserved/i);
    expect(admin.deleteAdminApi).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(admin.deleteAdminApi).toHaveBeenCalledWith('a1'));
  });

  it('marks inactive with an optional reason and marks active again', async () => {
    admin.userActionApi.mockResolvedValue();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Actions for Nisha Shah' }));
    await user.click(screen.getByRole('button', { name: 'Mark inactive…' }));
    await user.type(screen.getByLabelText(/reason/i), 'Misuse');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(admin.userActionApi).toHaveBeenCalledWith('a1', 'suspend', { reason: 'Misuse' }));

    await user.click(screen.getByRole('button', { name: 'Actions for Ravi Mehta' }));
    await user.click(screen.getByRole('button', { name: 'Mark active' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mark active' }));
    await waitFor(() => expect(admin.userActionApi).toHaveBeenCalledWith('a2', 'reactivate', undefined));
  });

  it('resets a password directly after typing a new one', async () => {
    admin.resetAdminPasswordApi.mockResolvedValue({ delivered: true });
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Actions for Nisha Shah' }));
    await user.click(screen.getByRole('button', { name: 'Reset password…' }));
    const dialog = await screen.findByRole('dialog', { name: /reset password · nisha shah/i });
    const submit = within(dialog).getByRole('button', { name: 'Reset password' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/new password/i), 'Brand-New-2026');
    await user.click(submit);
    await waitFor(() => expect(admin.resetAdminPasswordApi).toHaveBeenCalledWith('a1', 'Brand-New-2026'));
  });

  it('shows only password reset to an admin who holds users.reset_password but cannot manage admins', async () => {
    admin.listUsersApi.mockResolvedValue({ users: rows, totalCount: 2 });
    const store = await makeStore({ ...adminUser, permissions: ['users.reset_password'] });
    renderWithApp(<AdminUsersPage />, { store });
    await screen.findByText('Nisha Shah');
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Add admin' })).not.toBeInTheDocument();
    expect(await menuLabels(user, 'Nisha Shah')).toEqual(['Reset password…']);
  });

  it('signs an admin out everywhere after confirmation', async () => {
    admin.userActionApi.mockResolvedValue();
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Actions for Nisha Shah' }));
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(admin.userActionApi).toHaveBeenCalledWith('a1', 'revoke-sessions'));
  });
});

describe('Members page (directory management only)', () => {
  const member: adminApi.StaffMember = {
    id: 'm1',
    name: 'Asha Patel',
    village: 'Unjha',
    city: 'Mehsana',
    country: 'India',
    occupation: null,
    bio: null,
    joinedYear: null,
    highlighted: false,
    membershipStatus: 'active',
    visibility: 'public',
    anonymizedAt: null,
  };
  const open = async (permissions: string[]) => {
    admin.listStaffMembersApi.mockResolvedValue({ members: [member, { ...member, id: 'm2', name: 'Hidden Hari', visibility: 'hidden' }], totalCount: 2 });
    const store = await makeStore({ ...adminUser, permissions });
    renderWithApp(<AdminMembersPage />, { store });
    await screen.findByText('Asha Patel');
    return userEvent.setup();
  };

  it('shows entries as plain directory records with only "Everyone" or "Office only" visibility', async () => {
    await open(['members.read']);
    const table = screen.getByRole('table', { name: 'Members' });
    expect(within(table).getByText('Everyone')).toBeInTheDocument();
    expect(within(table).getByText('Office only')).toBeInTheDocument();
    expect(screen.queryByText(/pending approval|has an account|directory entry only/i)).not.toBeInTheDocument();
  });

  it('has no account filter and no "Members" visibility option', async () => {
    await open(['members.read']);
    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
    const options = within(screen.getByLabelText('Visibility')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Any visibility', 'Office only', 'Everyone']);
    expect(admin.listStaffMembersApi).toHaveBeenCalledWith(expect.not.objectContaining({ accountStatus: expect.anything(), hasAccount: expect.anything() }));
  });

  it('offers Edit and Anonymise only; never approve, reject, suspend, reactivate or create sign-in', async () => {
    const user = await open(['members.read', 'members.update', 'members.anonymize', 'members.create', 'members.export']);
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Asha Patel' }));
    const labels = within(screen.getByRole('list', { name: 'Actions for Asha Patel' })).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Edit', 'Anonymise…']);
  });

  it('hides actions the admin was not granted', async () => {
    await open(['members.read']);
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Asha Patel|Actions for Asha Patel/ })).not.toBeInTheDocument();
  });
});

describe('ContactDrawer (permission-gated controls)', () => {
  const message: adminApi.ContactMessage = {
    id: 'c1',
    reference: 'ABC123',
    name: 'Visitor',
    email: 'visitor@example.test',
    topic: 'Membership',
    status: 'new',
    assignedTo: null,
    resolvedAt: null,
    createdAt: '2030-01-10T05:00:00.000Z',
    preview: 'hi',
    message: 'Hello <b>team</b>',
    notes: [],
  };
  const open = async (permissions: string[]) => {
    admin.getContactApi.mockResolvedValue(message);
    const store = await makeStore({ ...adminUser, id: 'staff1', permissions });
    renderWithApp(<ContactDrawer id="c1" onClose={vi.fn()} onChanged={vi.fn()} />, { store });
    await screen.findByText('#ABC123');
    return { store, user: userEvent.setup() };
  };

  it('renders the message as plain text', async () => {
    await open([]);
    expect(screen.getByText('Hello <b>team</b>')).toBeInTheDocument();
    expect(document.querySelector('dialog b')).toBeNull();
  });

  it('is read-only for staff who can only view', async () => {
    await open(['contacts.read']);
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign to me/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
  });

  it('lets a resolver change the status and add a note, but not assign', async () => {
    admin.updateContactApi.mockResolvedValue(message);
    admin.addContactNoteApi.mockResolvedValue(message);
    const { user } = await open(['contacts.resolve']);
    expect(screen.queryByRole('button', { name: /assign to me/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    await waitFor(() => expect(admin.updateContactApi).toHaveBeenCalledWith('c1', { status: 'resolved' }));
    await user.type(screen.getByLabelText('Add a note'), '  Called back  ');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(admin.addContactNoteApi).toHaveBeenCalledWith('c1', 'Called back'));
  });

  it('lets an assigner take the message and shows the server error if it fails', async () => {
    admin.updateContactApi.mockRejectedValue(apiError(409, 'Already assigned to someone else'));
    const { user, store } = await open(['contacts.assign']);
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /assign to me/i }));
    await waitFor(() => expect(admin.updateContactApi).toHaveBeenCalledWith('c1', { assignedTo: 'staff1' }));
    await waitFor(() => expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'error', message: 'Already assigned to someone else' }));
  });

  it('shows an error with retry when the message cannot load', async () => {
    admin.getContactApi.mockRejectedValue(apiError(404, 'Message not found'));
    renderWithApp(<ContactDrawer id="c1" onClose={vi.fn()} onChanged={vi.fn()} />, { store: await makeStore({ ...adminUser, permissions: [] }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Message not found');
  });
});
