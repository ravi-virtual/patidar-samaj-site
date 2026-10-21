import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Landmark } from 'lucide-react';
import { getHomeApi, mediaUrl } from '../api/siteApi';
import type { HomeData } from '../api/types';
import { Async } from '../components/ui/Async';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { DateTile, Section } from '../components/site/Section';
import { formatDay, formatMonth, formatShortDate, formatTime, place } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import { useAppSelector } from '../store/hooks';

const quickLinks = [
  { to: '/register', label: 'Register your family' },
  { to: '/events', label: 'RSVP to an event' },
  { to: '/members', label: 'Find a family' },
  { to: '/contact', label: 'Book Patidar Samaj Bhavan' },
];

function HomeSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 lg:grid-cols-3">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-72 lg:col-span-2" />
      <Skeleton className="h-72" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}

function Hero({ home }: { home: HomeData }) {
  const welcome = home.blocks['home.welcome'];
  const image = mediaUrl(welcome?.items[0]?.imageMediaId);
  const featured = home.featuredEvent;
  const registerOpen = useAppSelector((s) => s.site.settings?.registrationOpen) !== false;
  const signedIn = useAppSelector((s) => Boolean(s.auth.user));
  return (
    <Card padded={false} className="flex flex-wrap overflow-hidden lg:col-span-2">
      <div className="min-w-[280px] flex-[1_1_300px] p-6 sm:p-8">
        {featured && featured.registrationState === 'open' && (
          <Link
            to={`/events/${featured.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
            {featured.title} — registration open
          </Link>
        )}
        <h1 className="mb-3 mt-4 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.1] tracking-tight [text-wrap:balance]">
          {welcome?.title ?? home.settings.name}
        </h1>
        <p className="mb-5 max-w-md text-[15px] text-text-secondary [text-wrap:pretty]">
          {welcome?.body ?? home.settings.tagline}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/members"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Explore directory
          </Link>
          <Link
            to="/about"
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-text hover:bg-surface-muted"
          >
            About the Samaj
          </Link>
          {registerOpen && !signedIn && (
            <Link
              to="/register"
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-accent hover:text-accent-strong"
            >
              Join the community <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
      {image ? (
        <img src={image} alt="" className="min-h-60 max-w-full flex-[1_1_240px] object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex min-h-48 flex-[1_1_240px] items-center justify-center bg-gradient-to-br from-accent-soft to-surface-muted text-accent"
        >
          <Landmark className="h-14 w-14 opacity-50" />
        </div>
      )}
    </Card>
  );
}

function Stats({ home }: { home: HomeData }) {
  const items = home.blocks['home.stats']?.items ?? [];
  if (!items.length) return null;
  return (
    <Card className="grid content-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
      <h2 className="sr-only">Community at a glance</h2>
      {items.slice(0, 4).map((s, i) => (
        <div key={i} className="rounded-xl border border-surface-muted bg-bg p-3.5">
          <p className="text-[13px] text-text-muted">{s.label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
        </div>
      ))}
    </Card>
  );
}

function NextEvent({ home }: { home: HomeData }) {
  const e = home.featuredEvent ?? home.upcomingEvents[0];
  const image = mediaUrl(e?.imageMediaId);
  if (!e) {
    return (
      <Card className="flex min-h-48 flex-col items-center justify-center gap-1 text-center lg:col-span-1">
        <CalendarDays aria-hidden="true" className="h-6 w-6 text-text-subtle" />
        <p className="font-semibold">No upcoming events yet</p>
        <p className="text-sm text-text-muted">New events appear here as soon as they are announced.</p>
      </Card>
    );
  }
  return (
    <section
      aria-label="Next event"
      className="relative flex min-h-72 overflow-hidden rounded-xl bg-zinc-900 text-white shadow-card"
    >
      {image && <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />}
      <div className="relative mt-auto w-full bg-gradient-to-t from-zinc-900/95 to-transparent p-6">
        <p className="font-mono text-xs uppercase text-indigo-200">Next event · {formatShortDate(e.startsAt)}</p>
        <h2 className="my-1 text-2xl font-semibold tracking-tight">{e.title}</h2>
        <p className="mb-3.5 text-sm text-zinc-300">
          {formatTime(e.startsAt)} · {e.venue}
        </p>
        <Link
          to={`/events/${e.id}`}
          className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          View &amp; RSVP
        </Link>
      </div>
    </section>
  );
}

function HomeContent({ home }: { home: HomeData }) {
  const upcoming = home.upcomingEvents.filter((e) => e.id !== (home.featuredEvent ?? home.upcomingEvents[0])?.id);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Hero home={home} />
      <Stats home={home} />
      <NextEvent home={home} />

      <Section title="Upcoming" to="/events">
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing else is scheduled right now.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {upcoming.map((e) => (
              <li key={e.id} className="border-t border-surface-muted first:border-t-0">
                <Link to={`/events/${e.id}`} className="flex items-center gap-3 py-2.5 text-text">
                  <DateTile month={formatMonth(e.startsAt)} day={formatDay(e.startsAt)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{e.title}</span>
                    <span className="text-xs text-text-muted">
                      {e.category} · {formatTime(e.startsAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Quick actions">
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {quickLinks.map((q) => (
            <li key={q.to}>
              <Link
                to={q.to}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-text hover:bg-bg"
              >
                {q.label}
                <ArrowRight aria-hidden="true" className="h-4 w-4 text-text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Recent announcements" to="/news" linkLabel="All news">
        {home.announcements.length === 0 ? (
          <p className="text-sm text-text-muted">No announcements yet.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {home.announcements.map((a) => (
              <li key={a.id} className="border-t border-surface-muted first:border-t-0">
                <Link to={`/news/${a.id}`} className="block py-2.5 text-text">
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="font-mono">{formatShortDate(a.publishedAt)}</span>
                    <Badge>{a.category}</Badge>
                    {a.pinned && <Badge tone="accent">Pinned</Badge>}
                  </span>
                  <span className="mt-0.5 block font-medium">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {home.memberHighlights.length > 0 && (
        <Section title="Member highlights" to="/members" linkLabel="Directory" className="lg:col-span-2">
          <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {home.memberHighlights.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/members/${m.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-surface-muted p-2.5 text-text hover:border-border hover:bg-bg"
                >
                  <Avatar name={m.name} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block truncate text-xs text-text-muted">{place(m.city, m.country)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {home.links.length > 0 && (
        <Section title="Important links" to="/links" className="lg:col-span-3">
          <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {home.links.map((l) => (
              <li key={l.id}>
                <Link
                  to="/links"
                  className="flex items-center gap-2.5 rounded-lg border border-border p-3 text-text hover:bg-bg"
                >
                  <span className="min-w-0 leading-tight">
                    <span className="block text-sm font-medium">{l.label}</span>
                    <span className="block font-mono text-xs text-text-muted">{l.category}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function HomePage() {
  const signedIn = useAppSelector((s) => Boolean(s.auth.user));
  // The home page differs for signed-in members (directory highlights), so sign-in changes the key.
  const { data, initialLoading, error, retry } = useFetch(`home:${signedIn}`, getHomeApi);
  return (
    <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<HomeSkeleton />}>
      {(home) => <HomeContent home={home} />}
    </Async>
  );
}
