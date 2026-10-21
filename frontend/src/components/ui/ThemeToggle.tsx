import { useId } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { changeTheme } from '../../store/slices/themeSlice';
import type { ThemePreference } from '../../utils/theme';

const options: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Light / Dark / System selector. Built on native radio inputs so arrow-key navigation,
 * screen-reader semantics and focus handling come from the browser.
 */
export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const preference = useAppSelector((s) => s.theme.preference);
  // Unique per instance: the header and the settings page both show a toggle.
  const name = useId();

  return (
    <fieldset className="m-0 inline-flex rounded-md border border-border bg-surface p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {options.map(({ value, label, Icon }) => (
        <label
          key={value}
          className="relative cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)] rounded-[5px]"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={preference === value}
            onChange={() => void dispatch(changeTheme(value))}
            className="peer sr-only"
          />
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[5px] text-text-muted transition-colors hover:text-text peer-checked:bg-primary peer-checked:text-primary-foreground"
            title={label}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
