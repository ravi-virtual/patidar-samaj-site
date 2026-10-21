import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as workspaceApi from '../../src/api/workspaceApi';
import * as siteApi from '../../src/api/siteApi';
import { ProfileForm } from '../../src/components/workspace/ProfileForm';
import { SecurityPanel } from '../../src/components/workspace/SecurityPanel';
import MyRsvpsPage from '../../src/pages/workspace/MyRsvpsPage';
import { getCsrfToken, setCsrfToken } from '../../src/api/csrf';
import { apiError, makeEvent, renderWithApp } from '../helpers';

vi.mock('../../src/api/workspaceApi', () => ({
  updateMyProfileApi: vi.fn(),
  listMyRegistrationsApi: vi.fn(),
  listMySessionsApi: vi.fn(),
  revokeMySessionApi: vi.fn(),
  changePasswordApi: vi.fn(),
}));
vi.mock('../../src/api/siteApi', () => ({ cancelRsvpApi: vi.fn() }));

const ws = vi.mocked(workspaceApi);
const site = vi.mocked(siteApi);

const profile: workspaceApi.OwnProfile = {
  id: 'p1',
  name: 'Asha Patel',
  village: 'Unjha',
  city: 'Mehsana',
  country: 'India',
  occupation: 'Teacher',
  bio: 'Hello',
  joinedYear: 2015,
  highlighted: false,
  familySize: 4,
  kul: 'Kadva',
  phone: '+91 98765 43210',
  visibility: 'members',
  membershipStatus: 'active',
};

beforeEach(() => {
  vi.resetAllMocks();
  setCsrfToken(null);
});

describe('ProfileForm', () => {
  const setup = (onSaved = vi.fn()) => {
    const utils = renderWithApp(<ProfileForm profile={profile} onSaved={onSaved} />);
    return { ...utils, onSaved, user: userEvent.setup() };
  };

  it('starts with the saved values and nothing to save', () => {
    setup();
    expect(screen.getByLabelText('Village')).toHaveValue('Unjha');
    expect(screen.getByLabelText('Family size')).toHaveValue('4');
    expect(screen.getByLabelText(/who can find me/i)).toHaveValue('members');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('explains what each visibility level means as it changes', async () => {
    const { user } = setup();
    expect(screen.getByText(/signed-in members can find you/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/who can find me/i), 'hidden');
    expect(screen.getByText('Only the Samaj office can see your entry.')).toBeInTheDocument();
  });

  it('validates phone, family size and markup before calling the API', async () => {
    const { user } = setup();
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), 'abc');
    await user.clear(screen.getByLabelText('Family size'));
    await user.type(screen.getByLabelText('Family size'), '99');
    await user.type(screen.getByLabelText('City'), '<x>');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid phone number')).toBeInTheDocument();
    expect(screen.getByText('Enter a number from 1 to 40')).toBeInTheDocument();
    expect(screen.getByText('Contains invalid characters')).toBeInTheDocument();
    expect(ws.updateMyProfileApi).not.toHaveBeenCalled();
  });

  it('saves, converting a blank family size to null, and reports success', async () => {
    ws.updateMyProfileApi.mockResolvedValue({ ...profile, city: 'Ahmedabad', familySize: null });
    const { user, onSaved, store } = setup();
    await user.clear(screen.getByLabelText('City'));
    await user.type(screen.getByLabelText('City'), 'Ahmedabad');
    await user.clear(screen.getByLabelText('Family size'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ city: 'Ahmedabad' })));
    expect(ws.updateMyProfileApi).toHaveBeenCalledWith(expect.objectContaining({ city: 'Ahmedabad', familySize: null, visibility: 'members' }));
    expect(store.getState().toast.at(-1)).toMatchObject({ message: 'Profile saved.', tone: 'success' });
    // the form is clean again after a save
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
  });

  it('puts a server field error on the field and a general failure in an alert', async () => {
    ws.updateMyProfileApi.mockRejectedValueOnce(apiError(422, 'Invalid', 'VALIDATION_ERROR', [{ field: 'village', message: 'Unknown village' }]));
    const { user } = setup();
    await user.type(screen.getByLabelText('Village'), 'x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Unknown village')).toBeInTheDocument();
    expect(screen.getByLabelText('Village')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Invalid')).not.toBeInTheDocument(); // the generic message is hidden when a field took the error

    ws.updateMyProfileApi.mockRejectedValueOnce(apiError(500, 'Database is down'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Database is down')).toBeInTheDocument();
  });

  it('discards edits', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Village'), 'zzz');
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Village')).toHaveValue('Unjha');
    expect(ws.updateMyProfileApi).not.toHaveBeenCalled();
  });
});

describe('SecurityPanel', () => {
  const sessions: workspaceApi.MySession[] = [
    { id: 's1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', lastSeenAt: '2030-01-10T05:00:00.000Z', createdAt: '2030-01-01T05:00:00.000Z', current: true },
    { id: 's2', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604.1', lastSeenAt: '2030-01-09T05:00:00.000Z', createdAt: '2030-01-01T05:00:00.000Z', current: false },
  ];

  const fillPasswords = async (user: ReturnType<typeof userEvent.setup>, over: Record<string, string> = {}) => {
    await user.type(screen.getByLabelText(/^current password/i), over.current ?? 'Old-Password-1');
    await user.type(screen.getByLabelText(/^new password/i), over.next ?? 'Brand-New-2026');
    await user.type(screen.getByLabelText(/^confirm new password/i), over.confirm ?? 'Brand-New-2026');
  };

  it('describes devices in plain words and only offers sign-out for other devices', async () => {
    ws.listMySessionsApi.mockResolvedValue(sessions);
    renderWithApp(<SecurityPanel />);
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Sign out' });
    expect(buttons).toHaveLength(1);
  });

  it('signs a device out, confirms, and reloads the list', async () => {
    ws.listMySessionsApi.mockResolvedValueOnce(sessions).mockResolvedValueOnce([sessions[0]!]);
    ws.revokeMySessionApi.mockResolvedValue();
    const user = userEvent.setup();
    const { store } = renderWithApp(<SecurityPanel />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(ws.revokeMySessionApi).toHaveBeenCalledWith('s2');
    await waitFor(() => expect(screen.queryByText('Safari on iOS')).not.toBeInTheDocument());
    expect(store.getState().toast.at(-1)).toMatchObject({ message: 'Device signed out.' });
  });

  it('shows an error when the device list cannot load', async () => {
    ws.listMySessionsApi.mockRejectedValue(apiError(500, 'Sessions unavailable'));
    renderWithApp(<SecurityPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessions unavailable');
  });

  it('checks password rules and the confirmation locally', async () => {
    ws.listMySessionsApi.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithApp(<SecurityPanel />);
    await fillPasswords(user, { next: 'short', confirm: 'different' });
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(ws.changePasswordApi).not.toHaveBeenCalled();
  });

  it('requires the current password', async () => {
    ws.listMySessionsApi.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithApp(<SecurityPanel />);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Enter your current password')).toBeInTheDocument();
  });

  it('changes the password, clears the fields and toasts the server message', async () => {
    ws.listMySessionsApi.mockResolvedValue([]);
    ws.changePasswordApi.mockResolvedValue('Password changed.');
    const user = userEvent.setup();
    const { store } = renderWithApp(<SecurityPanel />);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(store.getState().toast.at(-1)).toMatchObject({ message: 'Password changed.' }));
    expect(ws.changePasswordApi).toHaveBeenCalledWith({ currentPassword: 'Old-Password-1', newPassword: 'Brand-New-2026', confirmPassword: 'Brand-New-2026' });
    expect(screen.getByLabelText(/^current password/i)).toHaveValue('');
    expect(getCsrfToken()).toBeNull(); // the API module owns the token swap; the panel never touches it
  });

  it('shows the wrong-current-password error on that field', async () => {
    ws.listMySessionsApi.mockResolvedValue([]);
    ws.changePasswordApi.mockRejectedValue(
      apiError(400, 'Invalid', 'VALIDATION_ERROR', [{ field: 'currentPassword', message: 'Current password is incorrect' }]),
    );
    const user = userEvent.setup();
    renderWithApp(<SecurityPanel />);
    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(screen.getByLabelText(/^current password/i)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('MyRsvpsPage', () => {
  const reg = (over: Partial<workspaceApi.MyRegistration> = {}): workspaceApi.MyRegistration => ({
    id: 'r1',
    attendees: 2,
    registeredAt: '2030-01-01T00:00:00.000Z',
    upcoming: true,
    event: makeEvent(),
    ...over,
  });

  it('separates upcoming from past registrations and only lets upcoming ones be cancelled', async () => {
    ws.listMyRegistrationsApi.mockResolvedValue([
      reg(),
      reg({ id: 'r2', upcoming: false, attendees: 1, event: makeEvent({ id: 'e2', title: 'Diwali Mela' }) }),
    ]);
    renderWithApp(<MyRsvpsPage />);
    const upcoming = (await screen.findByRole('heading', { name: 'Upcoming' })).closest('section')!;
    const past = screen.getByRole('heading', { name: 'Past' }).closest('section')!;
    expect(within(upcoming).getByRole('link', { name: 'Navratri Garba Night' })).toHaveAttribute('href', '/events/e1');
    expect(within(upcoming).getByText(/2 people/)).toBeInTheDocument();
    expect(within(upcoming).getByRole('button', { name: 'Cancel RSVP' })).toBeInTheDocument();
    expect(within(past).getByText('Diwali Mela')).toBeInTheDocument();
    expect(within(past).getByText(/1 person\b/)).toBeInTheDocument();
    expect(within(past).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when nothing is upcoming', async () => {
    ws.listMyRegistrationsApi.mockResolvedValue([reg({ upcoming: false })]);
    renderWithApp(<MyRsvpsPage />);
    expect(await screen.findByText('Nothing upcoming.')).toBeInTheDocument();
  });

  it('shows an empty state with a way to find events', async () => {
    ws.listMyRegistrationsApi.mockResolvedValue([]);
    renderWithApp(<MyRsvpsPage />);
    expect(await screen.findByText('No RSVPs yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find an event' })).toHaveAttribute('href', '/events');
  });

  it('shows an error with retry', async () => {
    ws.listMyRegistrationsApi.mockRejectedValueOnce(apiError(500, 'RSVPs failed')).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderWithApp(<MyRsvpsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('RSVPs failed');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('No RSVPs yet')).toBeInTheDocument();
  });

  it('asks before cancelling, then cancels and reloads the list', async () => {
    ws.listMyRegistrationsApi.mockResolvedValueOnce([reg()]).mockResolvedValueOnce([]);
    site.cancelRsvpApi.mockResolvedValue(makeEvent());
    const user = userEvent.setup();
    const { store } = renderWithApp(<MyRsvpsPage />);
    await user.click(await screen.findByRole('button', { name: 'Cancel RSVP' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your places at “Navratri Garba Night” will be released');
    expect(site.cancelRsvpApi).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel registration' }));
    await waitFor(() => expect(site.cancelRsvpApi).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('No RSVPs yet')).toBeInTheDocument();
    expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'info' });
  });

  it('keeps the registration and shows the server error when cancelling fails', async () => {
    ws.listMyRegistrationsApi.mockResolvedValue([reg()]);
    site.cancelRsvpApi.mockRejectedValue(apiError(409, 'Too late to cancel'));
    const user = userEvent.setup();
    const { store } = renderWithApp(<MyRsvpsPage />);
    await user.click(await screen.findByRole('button', { name: 'Cancel RSVP' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel registration' }));
    await waitFor(() => expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'error', message: 'Too late to cancel' }));
    expect(ws.listMyRegistrationsApi).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Navratri Garba Night' })).toBeInTheDocument();
  });

  it('closes the dialog without cancelling when the user backs out', async () => {
    ws.listMyRegistrationsApi.mockResolvedValue([reg()]);
    const user = userEvent.setup();
    renderWithApp(<MyRsvpsPage />);
    await user.click(await screen.findByRole('button', { name: 'Cancel RSVP' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(site.cancelRsvpApi).not.toHaveBeenCalled();
  });
});
