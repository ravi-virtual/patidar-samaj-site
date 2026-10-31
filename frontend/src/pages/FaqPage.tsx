import { Link } from 'react-router-dom';
import { getFaqsApi } from '../api/siteApi';
import { FaqItem } from '../components/site/ContentViews';
import { Async } from '../components/ui/Async';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useTabEnabled } from '../hooks/useTabEnabled';
import { useFetch } from '../lib/useFetch';

export default function FaqPage() {
  const contactOn = useTabEnabled('contact');
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
                <FaqItem key={f.id} f={f} />
              ))}
            </Card>
          )
        }
      </Async>
      {contactOn && (
        <p className="mt-5 text-sm text-text-muted">
          Did not find your answer? <Link to="/contact">Contact the office</Link>.
        </p>
      )}
    </div>
  );
}
