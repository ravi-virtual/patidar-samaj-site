import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import * as adminApi from '../../src/api/adminApi';
import { DataTable, type Column } from '../../src/components/admin/DataTable';
import { ActionMenu } from '../../src/components/admin/ActionMenu';
import { RoleMatrix } from '../../src/components/admin/RoleMatrix';
import { StaffCreateDrawer } from '../../src/components/admin/StaffCreateDrawer';
import { ContactDrawer } from '../../src/components/admin/ContactDrawer';
import { useCan, useCanAny } from '../../src/components/admin/usePermissions';
import { ConfirmDialog } from '../../src/components/overlays/ConfirmDialog';
import { apiError, makeStore, memberUser, renderWithApp } from '../helpers';

vi.mock('../../src/api/authApi', () => ({ loginApi: vi.fn() }));
vi.mock('../../src/api/adminApi', () => ({
  getRolesApi: vi.fn(),
  createStaffApi: vi.fn(),
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
          { label: 'Export', onSelect: vi.fn(), show: canAny('events.export', 'registrations.export') },
          { label: 'View', onSelect: vi.fn() },
        ]}
      />
    );
  }
  const labelsFor = async (permissions: string[] | null) => {
    const store = await makeStore(permissions ? { ...memberUser, permissions } : null);
    const user = userEvent.setup();
    renderWithApp(<Probe />, { store });
    await user.click(screen.getByRole('button', { name: 'Event actions' }));
    return within(screen.getByRole('list')).getAllByRole('button').map((b) => b.textContent);
  };

  it('shows only the actions the signed-in user holds permissions for', async () => {
    expect(await labelsFor(['events.publish', 'registrations.export'])).toEqual(['Publish', 'Export', 'View']);
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

describe('RoleMatrix', () => {
  const matrix: adminApi.RoleMatrix = {
    roles: [
      { role: 'editor', permissions: ['events.read', 'events.write'] },
      { role: 'viewer', permissions: ['events.read'] },
    ],
    permissions: ['events.read', 'events.write', 'users.manage'],
    grantable: ['events.write'],
  };

  it('shows a Yes/No cell for every role and permission, in the server order', async () => {
    admin.getRolesApi.mockResolvedValue(matrix);
    renderWithApp(<RoleMatrix />);
    const table = await screen.findByRole('table', { name: /permissions granted by each role/i });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Permission', 'Editor', 'Viewer']);
    const rowFor = (p: string) => within(table).getByRole('row', { name: new RegExp(p.replace('.', '\\.')) });
    expect(within(rowFor('events.write')).getAllByText(/^(Yes|No)$/).map((c) => c.textContent)).toEqual(['Yes', 'No']);
    expect(within(rowFor('users.manage')).getAllByText(/^(Yes|No)$/).map((c) => c.textContent)).toEqual(['No', 'No']);
    expect(within(rowFor('events.read')).getAllByText(/^(Yes|No)$/).map((c) => c.textContent)).toEqual(['Yes', 'Yes']);
  });

  it('flags only the grantable permissions', async () => {
    admin.getRolesApi.mockResolvedValue(matrix);
    renderWithApp(<RoleMatrix />);
    await screen.findByRole('table');
    expect(screen.getAllByText('can be granted')).toHaveLength(1);
    expect(within(screen.getByRole('rowheader', { name: /events\.write/ })).getByText('can be granted')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    admin.getRolesApi.mockRejectedValueOnce(apiError(500, 'Roles unavailable')).mockResolvedValueOnce(matrix);
    const user = userEvent.setup();
    renderWithApp(<RoleMatrix />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Roles unavailable');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('StaffCreateDrawer (server-error mapping)', () => {
  const setup = () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    function Host() {
      const [open] = useState(true);
      return <StaffCreateDrawer open={open} onClose={onClose} onCreated={onCreated} />;
    }
    renderWithApp(<Host />);
    return { onCreated, onClose, user: userEvent.setup() };
  };
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/full name/i), 'New Editor');
    await user.type(screen.getByLabelText(/^email/i), 'editor@example.test');
  };

  it('validates locally and does not call the API', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(admin.createStaffApi).not.toHaveBeenCalled();
  });

  it('creates the account, hands over the one-time link and closes', async () => {
    admin.createStaffApi.mockResolvedValue({
      user: { name: 'New Editor' } as adminApi.AdminUser,
      setup: { url: 'https://site.test/reset?token=abc', expiresAt: '2030-01-01T00:00:00.000Z' },
    });
    const { user, onCreated, onClose } = setup();
    await fill(user);
    await user.selectOptions(screen.getByLabelText('Role'), 'viewer');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ url: 'https://site.test/reset?token=abc', expiresAt: '2030-01-01T00:00:00.000Z', name: 'New Editor' }));
    expect(admin.createStaffApi).toHaveBeenCalledWith({ name: 'New Editor', email: 'editor@example.test', role: 'viewer' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a server field error under the field and keeps the drawer open', async () => {
    admin.createStaffApi.mockRejectedValue(
      apiError(409, 'Duplicate', 'DUPLICATE_ERROR', [{ field: 'email', message: 'An account with this email already exists' }]),
    );
    const { user, onClose, onCreated } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('shows an unmapped server error as a general alert, ignoring unknown field names', async () => {
    admin.createStaffApi.mockRejectedValue(
      apiError(403, 'You cannot create staff accounts', 'FORBIDDEN', [{ field: 'nonexistent', message: 'ignored' }]),
    );
    const { user } = setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot create staff accounts');
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
    const store = await makeStore({ ...memberUser, id: 'staff1', permissions });
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
    renderWithApp(<ContactDrawer id="c1" onClose={vi.fn()} onChanged={vi.fn()} />, { store: await makeStore({ ...memberUser, permissions: [] }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Message not found');
  });
});
