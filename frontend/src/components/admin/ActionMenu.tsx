import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** Hidden when false, so callers can list every action and let permissions decide. */
  show?: boolean;
}

/**
 * "…" menu for row actions. Opens on click or Enter/Space, closes on Escape, outside click, scroll
 * or selection, and returns focus to the trigger. Items are real buttons in a labelled list.
 */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const visible = actions.filter((a) => a.show !== false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (visible.length === 0) return null;

  const toggle = () => {
    if (open || !trigger.current) return setPos(null);
    const r = trigger.current.getBoundingClientRect();
    // Fixed positioning keeps the menu visible even inside a scrolling table.
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  return (
    <div ref={root} className="relative inline-block text-left">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-md border border-border bg-surface p-1.5 text-text-secondary hover:bg-surface-muted"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>
      {pos && (
        <ul
          aria-label={label}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-[60] m-0 min-w-44 list-none rounded-lg border border-border bg-surface p-1 shadow-pop"
        >
          {visible.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                onClick={() => {
                  setPos(null);
                  a.onSelect();
                }}
                className={`block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${a.danger ? 'text-danger' : 'text-text'}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
