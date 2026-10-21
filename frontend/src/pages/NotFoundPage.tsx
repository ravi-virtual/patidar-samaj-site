import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Back to home
        </Link>
      }
    />
  );
}
