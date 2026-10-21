import { useAppSelector } from '../../store/hooks';

/** Footer for every public page. Contact details come from the organisation settings. */
export function SiteFooter() {
  const settings = useAppSelector((s) => s.site.settings);
  const year = new Date().getFullYear();
  const contact = settings?.contact;
  return (
    <footer className="border-t border-border px-4 py-4 text-[13px] text-text-muted sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p>
          © {year} {settings?.shortName ?? 'Kadva Patidar Samaj'}
          {settings?.footerNote ? ` · ${settings.footerNote}` : ''}
        </p>
        {(contact?.email || contact?.phone) && (
          <p>
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="text-text-muted hover:text-text">
                {contact.email}
              </a>
            )}
            {contact.email && contact.phone && ' · '}
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="text-text-muted hover:text-text">
                {contact.phone}
              </a>
            )}
          </p>
        )}
      </div>
    </footer>
  );
}
