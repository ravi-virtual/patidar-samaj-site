import { Link } from 'react-router-dom';
import { getFaqsApi } from '../api/siteApi';
import { Async } from '../components/ui/Async';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useFetch } from '../lib/useFetch';

export default function FaqPage() {
  const { data, initialLoading, error, retry } = useFetch('faqs', getFaqsApi);
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Quick answers about membership, events and the directory."
      />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-64" />}>
        {(faqs) =>
          faqs.length === 0 ? (
            <EmptyState title="No questions yet" description="Ask us anything on the contact page." />
          ) : (
            <Card padded={false}>
              {faqs.map((f) => (
                <details key={f.id} className="group border-b border-surface-muted px-5 py-3.5 last:border-b-0">
                  <summary className="cursor-pointer font-medium text-text marker:text-text-subtle">{f.question}</summary>
                  <p className="mt-2 whitespace-pre-line text-text-muted">{f.answer}</p>
                </details>
              ))}
            </Card>
          )
        }
      </Async>
      <p className="mt-5 text-sm text-text-muted">
        Did not find your answer? <Link to="/contact">Contact the office</Link>.
      </p>
    </div>
  );
}
