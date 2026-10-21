import { avatarColor, initials } from '../../lib/format';

const sizes = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-[72px] w-[72px] text-2xl',
};

/** Initials on a colour derived from the name. Decorative: the name is always written next to it. */
export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof sizes }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: avatarColor(name) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}
