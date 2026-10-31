import { Checkbox } from '../ui/Checkbox';
import { groupPermissions, permissionInfo, permissionLabel } from './permissionCatalog';
import { t } from '../../i18n';

const groups = groupPermissions();

/**
 * Grouped permission checkboxes shared by "Add admin" and "Edit admin". An admin has no default
 * permissions: every box is a plain checkbox and exactly the ticked ones apply. Each group has
 * "Select all" and "Clear".
 */
export function PermissionPicker({
  value,
  onChange,
  layout = 'modal',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** "page" lays the groups out in a responsive grid; "modal" stacks them in a scrolling column. */
  layout?: 'modal' | 'page';
}) {
  const selected = new Set(value);

  const toggle = (key: string, on: boolean) => onChange(on ? [...value, key] : value.filter((x) => x !== key));
  const setGroup = (keys: string[], on: boolean) =>
    onChange(on ? [...new Set([...value, ...keys])] : value.filter((x) => !keys.includes(x)));

  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-medium">{t('Permissions')}</legend>
      <p className="text-xs text-text-muted">
        {t('An admin can do only what is ticked here. Creating, editing and deleting admin accounts is always reserved for the Super Admin.')}
      </p>
      <div className={layout === 'page' ? 'grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'max-h-[48vh] space-y-3 overflow-y-auto pr-1'}>
        {groups.map((g) => {
          const on = g.permissions.filter((p) => selected.has(p)).length;
          return (
            <section key={g.id} aria-label={t(g.label)} className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-2 rounded-t-lg bg-surface-muted px-3 py-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t(g.label)}
                  <span className="ml-2 font-normal normal-case tracking-normal tabular-nums text-text-muted">
                    {t('{on} of {total}', { on, total: g.permissions.length })}
                  </span>
                </h3>
                <span className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setGroup(g.permissions, true)}
                    aria-label={t('Select all {group}', { group: t(g.label) })}
                    className="font-medium text-accent hover:underline"
                  >
                    {t('Select all')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroup(g.permissions, false)}
                    aria-label={t('Clear {group}', { group: t(g.label) })}
                    className="font-medium text-text-secondary hover:underline"
                  >
                    {t('Clear')}
                  </button>
                </span>
              </div>
              <ul className="divide-y divide-border">
                {g.permissions.map((p) => (
                  <li key={p} className="px-3 py-2.5">
                    <Checkbox
                      label={permissionLabel(p)}
                      description={permissionInfo[p] ? t(permissionInfo[p].description) : undefined}
                      checked={selected.has(p)}
                      onChange={(e) => toggle(p, e.target.checked)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </fieldset>
  );
}
