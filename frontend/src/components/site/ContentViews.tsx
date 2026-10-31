import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Landmark } from 'lucide-react';
import { mediaUrl } from '../../api/siteApi';
import type { CommitteeMember, ContentBlock, ContentItem, Faq, ImportantLink, Milestone } from '../../api/types';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { useTabEnabled } from '../../hooks/useTabEnabled';
import { EmptyState } from '../ui/EmptyState';

/**
 * Presentational pieces of the public content pages. The public pages and the admin preview both
 * render these, so what an editor previews cannot drift from what visitors see.
 */

// ─── Home ────────────────────────────────────────────────────────────────────

export function HeroCard({
  title,
  body,
  image,
}: {
  title: string;
  body: string;
  image: string | null;
}) {
  const directoryOn = useTabEnabled('directory');
  const aboutOn = useTabEnabled('about');
  return (
    <Card padded={false} className="flex flex-wrap overflow-hidden lg:col-span-2">
      <div className="min-w-[280px] flex-[1_1_300px] p-6 sm:p-8">
        <h1 className="mb-3 mt-0 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.1] tracking-tight [text-wrap:balance]">
          {title}
        </h1>
        <p className="mb-5 max-w-md text-[15px] text-text-secondary [text-wrap:pretty]">{body}</p>
        <div className="flex flex-wrap gap-2">
          {directoryOn && (
            <Link
              to="/members"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Explore directory
            </Link>
          )}
          {aboutOn && (
            <Link
              to="/about"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-text hover:bg-surface-muted"
            >
              About the Samaj
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

export function StatsCard({ items }: { items: ContentItem[] }) {
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

// ─── About ───────────────────────────────────────────────────────────────────

function Statement({ label, block }: { label: string; block?: ContentBlock }) {
  if (!block?.body) return null;
  return (
    <Card>
      <h2 className="text-[13px] font-medium text-text-muted">{label}</h2>
      <p className="mt-1.5 text-base">{block.body}</p>
    </Card>
  );
}

export function AboutContent({ blocks }: { blocks: Record<string, ContentBlock> }) {
  const committeeOn = useTabEnabled('committee');
  const historyOn = useTabEnabled('history');
  const faqOn = useTabEnabled('faq');
  const intro = blocks['about.intro'];
  const volunteers = blocks['about.volunteers'];
  const values = blocks['about.values']?.items ?? [];
  const achievements = blocks['about.achievements']?.items ?? [];
  const activities = blocks['about.activities']?.items ?? [];
  const hasAnything = Object.keys(blocks).some((k) => k.startsWith('about.'));

  if (!hasAnything) {
    return <EmptyState title="About page coming soon" description="The Samaj office has not published this page yet." />;
  }

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-wide text-accent">About</p>
        <h1 className="mb-3.5 mt-1.5 text-4xl font-semibold leading-tight tracking-tight">
          {intro?.title ?? 'About the Samaj'}
        </h1>
        {intro?.body && <p className="mb-3 text-[17px] text-text-secondary [text-wrap:pretty]">{intro.body}</p>}
        {volunteers?.body && <p className="text-text-muted">{volunteers.body}</p>}
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        <Statement label="Mission" block={blocks['about.mission']} />
        <Statement label="Vision" block={blocks['about.vision']} />
      </div>

      {values.length > 0 && (
        <section aria-labelledby="values-h">
          <h2 id="values-h" className="sr-only">
            Our values
          </h2>
          <ol className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {values.map((v, i) => (
              <li key={i} className="border-t border-text pt-3.5">
                <p className="font-mono text-xs text-text-muted">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="my-0.5 text-xl font-semibold">{v.title}</h3>
                <p className="text-text-muted">{v.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {achievements.length > 0 && (
        <section aria-labelledby="ach-h">
          <h2 id="ach-h" className="mb-3 text-lg font-semibold">
            Achievements
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            {achievements.map((a, i) => (
              <li key={i}>
                <Card className="h-full">
                  <p className="text-2xl font-semibold tabular-nums">{a.value}</p>
                  <p className="text-[13px] text-text-muted">{a.label}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activities.length > 0 && (
        <section aria-labelledby="act-h">
          <h2 id="act-h" className="mb-3 text-lg font-semibold">
            What we do
          </h2>
          <ul className="m-0 grid list-none gap-3.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {activities.map((a, i) => {
              const image = mediaUrl(a.imageMediaId);
              return (
                <li key={i}>
                  <Card padded={false} className="h-full overflow-hidden">
                    {image && <img src={image} alt="" loading="lazy" className="h-36 w-full object-cover" />}
                    <div className="p-4">
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="mt-1 text-sm text-text-muted">{a.text}</p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(committeeOn || historyOn || faqOn) && (
        <p className="flex flex-wrap gap-x-4 text-sm text-text-muted">
          <span>Read more:</span>
          {committeeOn && <Link to="/committee">Current committee</Link>}
          {historyOn && <Link to="/history">Our history</Link>}
          {faqOn && <Link to="/faq">FAQ</Link>}
        </p>
      )}
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────

export function HistoryIntro({ intro }: { intro?: ContentBlock }) {
  return (
    <div className="lg:sticky lg:top-20">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">History</p>
      <h1 className="mb-3.5 mt-1.5 text-4xl font-semibold leading-tight tracking-tight">
        {intro?.title ?? 'From legend to today'}
      </h1>
      {intro?.body && <p className="text-text-secondary">{intro.body}</p>}
      <p className="mt-4 text-xs text-text-muted">
        Each entry names where it is recorded. Where the records disagree, we say so.
      </p>
    </div>
  );
}

export function MilestoneEntry({ m }: { m: Milestone }) {
  const image = mediaUrl(m.imageMediaId);
  return (
    <li className="grid grid-cols-[72px_1fr] gap-4 pb-7">
      <p className="pt-0.5 font-mono text-[13px] text-text-muted">{m.periodLabel}</p>
      <div className="relative border-l border-border pl-5">
        <span
          aria-hidden="true"
          className="absolute -left-[5px] top-2 h-[9px] w-[9px] rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-soft)]"
        />
        <h2 className="text-[17px] font-semibold">{m.title}</h2>
        <p className="mb-2.5 mt-0.5 text-text-muted">{m.text}</p>
        {image && (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-36 w-full max-w-md rounded-lg border border-border object-cover"
          />
        )}
        {m.sourceRef && <p className="mt-1.5 text-xs text-text-subtle">Source: {m.sourceRef}</p>}
      </div>
    </li>
  );
}

// ─── Committee ───────────────────────────────────────────────────────────────

export function MemberCard({ m }: { m: CommitteeMember }) {
  const image = mediaUrl(m.imageMediaId);
  return (
    <Card className="flex h-full gap-3.5">
      {image ? (
        <img src={image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-full object-cover" />
      ) : (
        <Avatar name={m.name} size="lg" />
      )}
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug">{m.name}</h2>
        <div className="mt-0.5">
          <Badge tone="accent">{m.position}</Badge>
        </div>
        {m.bio && <p className="mt-2 text-[13px] text-text-muted">{m.bio}</p>}
      </div>
    </Card>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export function FaqItem({ f, open }: { f: Faq; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-surface-muted px-5 py-3.5 last:border-b-0">
      <summary className="cursor-pointer font-medium text-text marker:text-text-subtle">{f.question}</summary>
      <p className="mt-2 whitespace-pre-line text-text-muted">{f.answer}</p>
    </details>
  );
}

// ─── Links ───────────────────────────────────────────────────────────────────

export function LinkCard({ link }: { link: ImportantLink }) {
  const file = mediaUrl(link.fileMediaId);
  const href = file ?? link.url ?? undefined;
  const external = !file && href;
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
      >
        {file ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium">{link.label}</span>
        {link.description && <span className="mt-0.5 block text-[13px] text-text-muted">{link.description}</span>}
        <span className="mt-1 block font-mono text-xs text-text-subtle">
          {file ? 'PDF download' : 'External link'}
        </span>
      </span>
    </>
  );
  const cls = 'flex gap-3 rounded-xl border border-border bg-surface p-3.5 text-text hover:bg-bg';
  // External addresses open in a new tab without leaking the referrer or giving the target window access to ours.
  return href ? (
    <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
