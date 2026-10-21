import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { submitContactApi } from '../api/siteApi';
import { CONTACT_TOPICS } from '../api/types';
import { getErrorMessage, getFieldErrors } from '../api/axiosInstance';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SelectField, TextAreaField } from '../components/ui/FormFields';
import { PageHeader } from '../components/ui/PageHeader';
import { TextField } from '../components/ui/TextField';
import { useAppSelector } from '../store/hooks';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100)
    .refine((v) => !/[<>]/.test(v), 'Name contains invalid characters'),
  email: z.string().trim().min(1, 'Email is required').max(254).pipe(z.email('Enter a valid email address')),
  topic: z.enum(CONTACT_TOPICS),
  message: z
    .string()
    .trim()
    .min(10, 'Please write at least 10 characters')
    .max(4000, 'Message must be at most 4000 characters')
    .refine((v) => !/[<>]/.test(v), 'Message must not contain < or >'),
  website: z.string().max(500),
});
type ContactForm = z.infer<typeof schema>;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="m-0 mt-0.5 font-medium">{children}</dd>
    </Card>
  );
}

export default function ContactPage() {
  const settings = useAppSelector((s) => s.site.settings);
  const user = useAppSelector((s) => s.auth.user);
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', topic: CONTACT_TOPICS[0], message: '', website: '' },
  });

  const onSubmit = async (values: ContactForm) => {
    setFormError(null);
    try {
      setSent(await submitContactApi(values));
    } catch (err) {
      let placed = false;
      for (const f of getFieldErrors(err)) {
        if (f.field && f.field in values) {
          setError(f.field as keyof ContactForm, { message: f.message });
          placed = true;
        }
      }
      if (!placed) setFormError(getErrorMessage(err, 'Your message could not be sent. Please try again.'));
    }
  };

  const contact = settings?.contact;

  return (
    <>
      <PageHeader eyebrow="Contact" title="Contact the Samaj office" description="Questions about membership, events or booking the Bhavan." />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-6">
          {sent ? (
            <div className="space-y-3 py-2" role="status">
              <h2 className="text-lg font-semibold">Message received</h2>
              <p className="text-text-secondary">{sent}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setSent(null);
                  reset({ name: user?.name ?? '', email: user?.email ?? '', topic: CONTACT_TOPICS[0], message: '', website: '' });
                }}
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2">
              {formError && (
                <div className="sm:col-span-2">
                  <Alert tone="danger">{formError}</Alert>
                </div>
              )}
              <TextField label="Name" autoComplete="name" required error={errors.name?.message} {...register('name')} />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                hint="We reply to this address."
                error={errors.email?.message}
                {...register('email')}
              />
              <div className="sm:col-span-2">
                <SelectField label="Topic" error={errors.topic?.message} {...register('topic')}>
                  {CONTACT_TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="sm:col-span-2">
                <TextAreaField label="Message" rows={6} required error={errors.message?.message} {...register('message')} />
              </div>
              {/* Honeypot for bots. Hidden from sight and from assistive technology; humans never fill it. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
                </label>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" loading={isSubmitting}>
                  {isSubmitting ? 'Sending…' : 'Send message'}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <dl className="m-0 grid gap-2.5">
          {contact?.address && <Fact label="Address">{contact.address}</Fact>}
          {contact?.phone && (
            <Fact label="Phone">
              <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="font-mono text-text">
                {contact.phone}
              </a>
            </Fact>
          )}
          {contact?.email && (
            <Fact label="Email">
              <a href={`mailto:${contact.email}`} className="break-all text-text">
                {contact.email}
              </a>
            </Fact>
          )}
          {contact?.officeHours && <Fact label="Office hours">{contact.officeHours}</Fact>}
        </dl>
      </div>
    </>
  );
}
