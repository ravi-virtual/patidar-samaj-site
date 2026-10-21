import { Link } from 'react-router-dom';
import { getBlocksApi, mediaUrl } from '../api/siteApi';
import type { ContentBlock } from '../api/types';
import { Async } from '../components/ui/Async';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

function Statement({ label, block }: { label: string; block?: ContentBlock }) {
  if (!block?.body) return null;
  return (
    <Card>
      <h2 className="text-[13px] font-medium text-text-muted">{label}</h2>
      <p className="mt-1.5 text-base">{block.body}</p>
    </Card>
  );
}

function AboutContent({ blocks }: { blocks: Record<string, ContentBlock> }) {
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

      <p className="text-sm text-text-muted">
        Meet the <Link to="/committee">current committee</Link>, read our <Link to="/history">history</Link> or find
        answers in the <Link to="/faq">FAQ</Link>.
      </p>
    </div>
  );
}

export default function AboutPage() {
  const { data, initialLoading, error, retry } = useFetch('blocks', getBlocksApi);
  return (
    <Async
      data={data}
      loading={initialLoading}
      error={error}
      onRetry={retry}
      skeleton={<Skeleton className="h-96" />}
    >
      {(blocks) => <AboutContent blocks={blocks} />}
    </Async>
  );
}
