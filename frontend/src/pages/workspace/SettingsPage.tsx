import { useState } from 'react';
import { getMyProfileApi, type OwnProfile } from '../../api/workspaceApi';
import { ProfileForm } from '../../components/workspace/ProfileForm';
import { SecurityPanel } from '../../components/workspace/SecurityPanel';
import { Async } from '../../components/ui/Async';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { roleLabel } from '../../lib/labels';
import { useFetch } from '../../lib/useFetch';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAppSelector } from '../../store/hooks';

export default function SettingsPage() {
  usePageTitle('Profile & settings');
  const user = useAppSelector((s) => s.auth.user)!;
  const { data, initialLoading, error, retry } = useFetch('my-profile', getMyProfileApi);
  // After a save the form shows what the server returned, without another request.
  const [saved, setSaved] = useState<OwnProfile | null>(null);

  return (
    <>
      <PageHeader title="Profile & settings" description="Your details, appearance and sign-in security." />
      <div className="space-y-3.5">
        <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
          <Card className="space-y-3">
            <Avatar name={user.name} size="lg" />
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="break-all text-[13px] text-text-muted">{user.email}</p>
            </div>
            <span className="inline-block rounded-md border border-accent-border bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent-strong">
              {roleLabel(user.role)}
            </span>
          </Card>
          <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-80" />}>
            {(profile) =>
              profile ? (
                <ProfileForm profile={saved ?? profile} onSaved={setSaved} />
              ) : (
                <Card>
                  <h2 className="font-semibold">Profile</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    This account has no directory profile, so there is nothing to edit here.
                  </p>
                </Card>
              )
            }
          </Async>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="text-[13px] text-text-muted">
              Saved to your account, so it follows you to every device. “System” follows your device setting.
            </p>
          </div>
          <ThemeToggle />
        </Card>

        <SecurityPanel />
      </div>
    </>
  );
}
