import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { getAdminSettingsApi, updateAdminSettingsApi, type AdminSettings } from '../../api/adminApi';
import { getErrorMessage, getFieldErrors } from '../../api/axiosInstance';
import { BilingualField, errText } from '../../components/admin/BilingualField';
import { Alert } from '../../components/ui/Alert';
import { Async } from '../../components/ui/Async';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { Toggle } from '../../components/ui/Toggle';
import { getLanguage, t } from '../../i18n';
import type { PublicSettings } from '../../api/types';
import { PUBLIC_TABS } from '../../lib/publicTabs';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { settingsReplaced } from '../../store/slices/siteSlice';
import { showToast } from '../../store/slices/toastSlice';

interface Values {
  name: string;
  nameGu: string;
  shortName: string;
  shortNameGu: string;
  invocation: string;
  invocationGu: string;
  tagline: string;
  taglineGu: string;
  footerNote: string;
  footerNoteGu: string;
  email: string;
  phone: string;
  address: string;
  addressGu: string;
  officeHours: string;
  officeHoursGu: string;
  socialLinks: { label: string; url: string }[];
  publicTabs: AdminSettings['publicTabs'];
  themeDefault: AdminSettings['themeDefault'];
}

const toValues = (s: AdminSettings): Values => ({
  name: s.name,
  nameGu: s.nameGu ?? '',
  shortName: s.shortName,
  shortNameGu: s.shortNameGu ?? '',
  invocation: s.invocation,
  invocationGu: s.invocationGu ?? '',
  tagline: s.tagline,
  taglineGu: s.taglineGu ?? '',
  footerNote: s.footerNote,
  footerNoteGu: s.footerNoteGu ?? '',
  email: s.contact.email,
  phone: s.contact.phone,
  address: s.contact.address,
  addressGu: s.contact.addressGu ?? '',
  officeHours: s.contact.officeHours,
  officeHoursGu: s.contact.officeHoursGu ?? '',
  socialLinks: s.socialLinks,
  publicTabs: { ...s.publicTabs },
  themeDefault: s.themeDefault,
});

const required = (label: string) => ({ required: t('{label} is required', { label: t(label) }) });

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
        nameGu: v.nameGu.trim(),
        shortName: v.shortName.trim(),
        shortNameGu: v.shortNameGu.trim(),
        invocation: v.invocation.trim(),
        invocationGu: v.invocationGu.trim(),
        tagline: v.tagline.trim(),
        taglineGu: v.taglineGu.trim(),
        footerNote: v.footerNote.trim(),
        footerNoteGu: v.footerNoteGu.trim(),
        contact: {
          email: v.email.trim(),
          phone: v.phone.trim(),
          address: v.address.trim(),
          addressGu: v.addressGu.trim(),
          officeHours: v.officeHours.trim(),
          officeHoursGu: v.officeHoursGu.trim(),
        },
        socialLinks: v.socialLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        publicTabs: v.publicTabs,
        themeDefault: v.themeDefault,
      });
      onSaved(result);
      setSaved(true);
      dispatch(showToast(t('Settings saved.')));
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        const name = f.field?.replace(/^contact\./, '');
        if (name && name in v) {
          setError(name as keyof Values, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setError('root', { message: getErrorMessage(err, t('Could not save the settings')) });
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {errors.root?.message && <Alert tone="danger">{errors.root.message}</Alert>}
      {saved && !isDirty && <Alert tone="success">{t('Saved. The public site shows the new details straight away.')}</Alert>}

      <Card className="space-y-4">
        <h2 className="font-semibold">{t('Organisation')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <BilingualField label="Full name" required maxLength={150} en={register('name', required('Name'))} gu={register('nameGu')} enError={errText(errors.name)} guError={errText(errors.nameGu)} />
          <BilingualField label="Short name" required maxLength={80} en={register('shortName', required('Short name'))} gu={register('shortNameGu')} enError={errText(errors.shortName)} guError={errText(errors.shortNameGu)} />
          <BilingualField label="Invocation" maxLength={80} en={register('invocation')} gu={register('invocationGu')} enError={errText(errors.invocation)} guError={errText(errors.invocationGu)} />
          <BilingualField label="Tagline" maxLength={200} en={register('tagline')} gu={register('taglineGu')} enError={errText(errors.tagline)} guError={errText(errors.taglineGu)} />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">{t('Contact details')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('Email')} type="email" error={errText(errors.email)} {...register('email')} />
          <TextField label={t('Phone')} type="tel" maxLength={30} error={errText(errors.phone)} {...register('phone')} />
        </div>
        <BilingualField label="Office hours" maxLength={200} en={register('officeHours')} gu={register('officeHoursGu')} enError={errText(errors.officeHours)} guError={errText(errors.officeHoursGu)} />
        <BilingualField label="Address" multiline rows={2} maxLength={400} en={register('address')} gu={register('addressGu')} enError={errText(errors.address)} guError={errText(errors.addressGu)} />
        <BilingualField label="Footer note" maxLength={400} en={register('footerNote')} gu={register('footerNoteGu')} enError={errText(errors.footerNote)} guError={errText(errors.footerNoteGu)} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t('Social links')}</h2>
        {links.fields.map((field, i) => (
          <div key={field.id} className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-40 flex-1">
              <TextField label={t('Name')} maxLength={40} {...register(`socialLinks.${i}.label` as const)} />
            </div>
            <div className="min-w-56 flex-[2]">
              <TextField label={t('Web address')} type="url" placeholder="https://" maxLength={500} {...register(`socialLinks.${i}.url` as const)} />
            </div>
            <Button variant="ghost" onClick={() => links.remove(i)} aria-label={t('Delete link {number}', { number: i + 1 })} title={t('Delete')}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {links.fields.length < 8 && (
          <Button variant="secondary" size="sm" onClick={() => links.append({ label: '', url: '' })}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t('Add link')}
          </Button>
        )}
      </Card>

      <Card className="space-y-3.5">
        <h2 className="font-semibold">{t('Site behaviour')}</h2>
        <div className="max-w-xs">
          <SelectField label={t('Default colour theme')} hint={t('Used for visitors. People can choose their own.')} {...register('themeDefault')}>
            <option value="system">{t('Follow the device')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </SelectField>
        </div>
      </Card>

      <Card className="space-y-1">
        <h2 className="font-semibold">{t('Public site tabs')}</h2>
        <p className="pb-2 text-sm text-text-muted">{t('Turn a tab off to hide it from the public website.')}</p>
        <ul className="m-0 list-none divide-y divide-border p-0">
          {PUBLIC_TABS.map((tab) => (
            <li key={tab.key} className="py-3 first:pt-1 last:pb-0">
              <Toggle label={t(tab.label)} description={t(tab.description)} {...register(`publicTabs.${tab.key}` as const)} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(toValues(settings))}>
          {t('Discard changes')}
        </Button>
        <Button type="submit" disabled={!isDirty} loading={isSubmitting}>
          {t('Save settings')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The header, footer and contact page read the public shape: the visitor's language only, with no
 * `*Gu` keys. Built from the saved admin record the same way the server does (Gujarati when chosen
 * and filled in, otherwise English).
 */
const toPublicSettings = (s: AdminSettings): PublicSettings => {
  const pick = (en: string, gu?: string) => (getLanguage() === 'gu' && gu ? gu : en);
  return {
    name: pick(s.name, s.nameGu),
    shortName: pick(s.shortName, s.shortNameGu),
    invocation: pick(s.invocation, s.invocationGu),
    tagline: pick(s.tagline, s.taglineGu),
    logoUrl: s.logoUrl,
    contact: {
      email: s.contact.email,
      phone: s.contact.phone,
      address: pick(s.contact.address, s.contact.addressGu),
      officeHours: pick(s.contact.officeHours, s.contact.officeHoursGu),
    },
    socialLinks: s.socialLinks,
    footerNote: pick(s.footerNote, s.footerNoteGu),
    publicTabs: s.publicTabs,
    themeDefault: s.themeDefault,
  };
};

export default function AdminSettingsPage() {
  const dispatch = useAppDispatch();
  const { data, initialLoading, error, retry } = useFetch('admin-settings', getAdminSettingsApi);
  const [saved, setSaved] = useState<AdminSettings | null>(null);

  return (
    <>
      <PageHeader title={t('Settings')} description={t('Organisation details and site switches shown across the public site.')} />
      <Async data={data} loading={initialLoading} error={error} onRetry={retry} skeleton={<Skeleton className="h-96" />}>
        {(settings) => (
          <SettingsForm
            settings={saved ?? settings}
            onSaved={(s) => {
              setSaved(s);
              // The header, footer and contact page read the same details, so refresh them too.
              dispatch(settingsReplaced(toPublicSettings(s)));
            }}
          />
        )}
      </Async>
    </>
  );
}
