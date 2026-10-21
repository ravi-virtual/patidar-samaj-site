import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { getAdminSettingsApi, updateAdminSettingsApi, type AdminSettings } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { Alert } from '../../components/ui/Alert';
import { Async } from '../../components/ui/Async';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SelectField, TextAreaField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { settingsReplaced } from '../../store/slices/siteSlice';
import { showToast } from '../../store/slices/toastSlice';

interface Values {
  name: string;
  shortName: string;
  invocation: string;
  tagline: string;
  footerNote: string;
  email: string;
  phone: string;
  address: string;
  officeHours: string;
  socialLinks: { label: string; url: string }[];
  registrationOpen: boolean;
  directoryPublic: boolean;
  themeDefault: AdminSettings['themeDefault'];
}

const toValues = (s: AdminSettings): Values => ({
  name: s.name,
  shortName: s.shortName,
  invocation: s.invocation,
  tagline: s.tagline,
  footerNote: s.footerNote,
  email: s.contact.email,
  phone: s.contact.phone,
  address: s.contact.address,
  officeHours: s.contact.officeHours,
  socialLinks: s.socialLinks,
  registrationOpen: s.registrationOpen,
  directoryPublic: s.directoryPublic,
  themeDefault: s.themeDefault,
});

const required = (label: string) => ({ required: `${label} is required` });

function SettingsForm({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const dispatch = useAppDispatch();
  const form = useForm<Values>({ defaultValues: toValues(settings) });
  const { register, handleSubmit, reset, control, setError, formState } = form;
  const { errors, isDirty, isSubmitting } = formState;
  const links = useFieldArray({ control, name: 'socialLinks' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    reset(toValues(settings));
  }, [settings, reset]);

  const onSubmit = async (v: Values) => {
    setSaved(false);
    try {
      const result = await updateAdminSettingsApi({
        name: v.name.trim(),
        shortName: v.shortName.trim(),
        invocation: v.invocation.trim(),
        tagline: v.tagline.trim(),
        footerNote: v.footerNote.trim(),
        contact: { email: v.email.trim(), phone: v.phone.trim(), address: v.address.trim(), officeHours: v.officeHours.trim() },
        socialLinks: v.socialLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        registrationOpen: v.registrationOpen,
        directoryPublic: v.directoryPublic,
        themeDefault: v.themeDefault,
      });
      onSaved(result);
      setSaved(true);
      dispatch(showToast('Settings saved.'));
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        const name = f.field?.replace(/^contact\./, '');
        if (name && name in v) {
          setError(name as keyof Values, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, 'Could not save the settings') });
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {errors.root?.message && <Alert tone="danger">{errors.root.message}</Alert>}
      {saved && !isDirty && <Alert tone="success">Saved. The public site shows the new details straight away.</Alert>}

      <Card className="space-y-4">
        <h2 className="font-semibold">Organisation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" required maxLength={150} error={errors.name?.message} {...register('name', required('Name'))} />
          <TextField label="Short name" required maxLength={80} error={errors.shortName?.message} {...register('shortName', required('Short name'))} />
          <TextField label="Invocation" maxLength={80} error={errors.invocation?.message} {...register('invocation')} />
          <TextField label="Tagline" maxLength={200} error={errors.tagline?.message} {...register('tagline')} />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Contact details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Phone" type="tel" maxLength={30} error={errors.phone?.message} {...register('phone')} />
          <TextField label="Office hours" maxLength={200} error={errors.officeHours?.message} {...register('officeHours')} />
        </div>
        <TextAreaField label="Address" rows={2} maxLength={400} error={errors.address?.message} {...register('address')} />
        <TextField label="Footer note" maxLength={400} error={errors.footerNote?.message} {...register('footerNote')} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Social links</h2>
        {links.fields.map((field, i) => (
          <div key={field.id} className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-40 flex-1">
              <TextField label="Name" maxLength={40} {...register(`socialLinks.${i}.label` as const)} />
            </div>
            <div className="min-w-56 flex-[2]">
              <TextField label="Web address" type="url" placeholder="https://" maxLength={500} {...register(`socialLinks.${i}.url` as const)} />
            </div>
            <Button variant="ghost" onClick={() => links.remove(i)} aria-label={`Remove link ${i + 1}`}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {links.fields.length < 8 && (
          <Button variant="secondary" size="sm" onClick={() => links.append({ label: '', url: '' })}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Add link
          </Button>
        )}
      </Card>

      <Card className="space-y-3.5">
        <h2 className="font-semibold">Site behaviour</h2>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" {...register('registrationOpen')} />
          <span>
            <strong className="font-medium">Registration is open</strong>
            <span className="block text-text-muted">When off, new families cannot create an account.</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" {...register('directoryPublic')} />
          <span>
            <strong className="font-medium">The directory is visible to visitors</strong>
            <span className="block text-text-muted">
              When off, only signed-in members see the directory. Members who chose “Everyone” are still hidden from visitors.
            </span>
          </span>
        </label>
        <div className="max-w-xs">
          <SelectField label="Default colour theme" hint="Used for visitors and for new accounts. People can choose their own." {...register('themeDefault')}>
            <option value="system">Follow the device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </SelectField>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(toValues(settings))}>
          Discard changes
        </Button>
        <Button type="submit" disabled={!isDirty} loading={isSubmitting}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

export default function AdminSettingsPage() {
  const dispatch = useAppDispatch();
  const { data, initialLoading, error, retry } = useFetch('admin-settings', getAdminSettingsApi);
  const [saved, setSaved] = useState<AdminSettings | null>(null);

  return (
    <>
      <PageHeader title="Settings" description="Organisation details and site switches shown across the public site." />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-96" />}>
        {(settings) => (
          <SettingsForm
            settings={saved ?? settings}
            onSaved={(s) => {
              setSaved(s);
              // The header, footer and contact page read the same details, so refresh them too.
              dispatch(settingsReplaced({ ...s }));
            }}
          />
        )}
      </Async>
    </>
  );
}
