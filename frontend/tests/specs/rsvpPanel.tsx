import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as siteApi from '../../src/api/siteApi';
import { RsvpPanel } from '../../src/components/site/RsvpPanel';
import { apiError, makeEvent, makeStore, memberUser, renderWithApp } from '../helpers';
import type { RegistrationState } from '../../src/api/types';

vi.mock('../../src/api/authApi', () => ({ loginApi: vi.fn() }));
vi.mock('../../src/api/siteApi', () => ({ rsvpApi: vi.fn(), cancelRsvpApi: vi.fn() }));

const api = vi.mocked(siteApi);
const onChanged = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RsvpPanel', () => {
  it('sends signed-out visitors to the login page and offers no form', () => {
    renderWithApp(<RsvpPanel event={makeEvent()} onChanged={onChanged} />);
    expect(screen.getByRole('link', { name: 'Log in to RSVP' })).toHaveAttribute('href', '/login');
    expect(screen.getByText(/only approved members/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
  });

  it('does not offer the form to an account without the RSVP permission', async () => {
    const store = await makeStore({ ...memberUser, permissions: ['members.read'] });
    renderWithApp(<RsvpPanel event={makeEvent()} onChanged={onChanged} />, { store });
    expect(screen.getByText(/cannot register for events yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
  });

  it('lets a member register for a chosen number of people, then refreshes', async () => {
    api.rsvpApi.mockResolvedValue(makeEvent());
    const user = userEvent.setup();
    const store = await makeStore(memberUser);
    renderWithApp(<RsvpPanel event={makeEvent()} onChanged={onChanged} />, { store });
    expect(screen.getByText('40 places left')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Number of people'), '3');
    await user.click(screen.getByRole('button', { name: 'RSVP' }));
    await waitFor(() => expect(api.rsvpApi).toHaveBeenCalledWith('e1', 3));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'success', message: expect.stringContaining('registered') });
  });

  it('caps the number of people at the places left and at ten', async () => {
    const store = await makeStore(memberUser);
    const { unmount } = renderWithApp(<RsvpPanel event={makeEvent({ spotsLeft: 2 })} onChanged={onChanged} />, { store });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1', '2']);
    unmount();
    renderWithApp(<RsvpPanel event={makeEvent({ spotsLeft: null })} onChanged={onChanged} />, { store });
    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(screen.queryByText(/places left/)).not.toBeInTheDocument();
  });

  it('shows the server error as a toast and still refreshes (the event may have filled up)', async () => {
    api.rsvpApi.mockRejectedValue(apiError(409, 'This event is now full', 'CONFLICT'));
    const user = userEvent.setup();
    const store = await makeStore(memberUser);
    renderWithApp(<RsvpPanel event={makeEvent()} onChanged={onChanged} />, { store });
    await user.click(screen.getByRole('button', { name: 'RSVP' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'error', message: 'This event is now full' });
  });

  it('shows a registered member how many are coming and lets them cancel after confirming', async () => {
    api.cancelRsvpApi.mockResolvedValue(makeEvent());
    const user = userEvent.setup();
    const store = await makeStore(memberUser);
    renderWithApp(<RsvpPanel event={makeEvent({ myRegistration: { attendees: 3 } })} onChanged={onChanged} />, { store });
    expect(screen.getByText(/You’re registered for 3 people/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel registration' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(api.cancelRsvpApi).not.toHaveBeenCalled(); // asked first
    expect(dialog).toHaveTextContent('3 places are released');
    await user.click(screen.getAllByRole('button', { name: 'Cancel registration' }).at(-1)!);
    await waitFor(() => expect(api.cancelRsvpApi).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(store.getState().toast.at(-1)).toMatchObject({ tone: 'info' });
  });

  it('says "registered" without a head count for a single person', async () => {
    renderWithApp(<RsvpPanel event={makeEvent({ myRegistration: { attendees: 1 } })} onChanged={onChanged} />, { store: await makeStore(memberUser) });
    expect(screen.getByText(/You’re registered\./)).toBeInTheDocument();
  });

  it.each<[RegistrationState, string]>([
    ['not_yet_open', 'Registration has not opened yet.'],
    ['closed', 'Registration for this event has closed.'],
    ['full', 'This event is full.'],
    ['past', 'This event has ended.'],
    ['cancelled', 'This event was cancelled.'],
    ['unavailable', 'Registration is not available for this event.'],
  ])('explains %s instead of offering a form, even to a member', async (state, text) => {
    renderWithApp(<RsvpPanel event={makeEvent({ registrationState: state })} onChanged={onChanged} />, { store: await makeStore(memberUser) });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'RSVP' })).not.toBeInTheDocument();
  });

  it('does not offer to cancel a registration for an event that has ended or been cancelled', async () => {
    const store = await makeStore(memberUser);
    const { unmount } = renderWithApp(
      <RsvpPanel event={makeEvent({ registrationState: 'past', myRegistration: { attendees: 2 } })} onChanged={onChanged} />,
      { store },
    );
    expect(screen.getByText(/registered/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel registration' })).not.toBeInTheDocument();
    unmount();
    renderWithApp(
      <RsvpPanel event={makeEvent({ registrationState: 'cancelled', myRegistration: { attendees: 2 } })} onChanged={onChanged} />,
      { store },
    );
    expect(screen.queryByRole('button', { name: 'Cancel registration' })).not.toBeInTheDocument();
  });

  it('still lets a registered member cancel when registration has closed or the event is full', async () => {
    const store = await makeStore(memberUser);
    renderWithApp(
      <RsvpPanel event={makeEvent({ registrationState: 'full', myRegistration: { attendees: 1 } })} onChanged={onChanged} />,
      { store },
    );
    expect(screen.getByRole('button', { name: 'Cancel registration' })).toBeInTheDocument();
  });
});
