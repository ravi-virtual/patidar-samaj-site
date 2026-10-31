import { Pencil, Trash2 } from 'lucide-react';
import { ActionMenu, type MenuAction } from './ActionMenu';

const btn =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

interface RowActionsProps {
  /** Human name of the row, used in accessible labels ("Edit <name>"). */
  name: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Direct Edit (pencil) and Delete (trash) icon buttons for rows with no other actions. */
export function RowActions({ name, onEdit, onDelete }: RowActionsProps) {
  if (!onEdit && !onDelete) return null;
  return (
    <div className="inline-flex items-center gap-1.5">
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} title="Edit" className={`${btn} text-text-secondary`}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label={`Delete ${name}`} title="Delete" className={`${btn} text-danger`}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export type RowMenuAction = MenuAction & { kind?: 'edit' | 'delete' };

/**
 * Row actions with one convention: edit/delete-only rows show icon buttons; rows with other actions
 * (publish, archive, …) keep the "…" menu, where Edit and Delete get fixed labels and icons.
 */
export function RowMenu({ name, actions }: { name: string; actions: RowMenuAction[] }) {
  const visible = actions.filter((a) => a.show !== false);
  const onlyEditDelete = visible.every((a) => a.kind);
  if (onlyEditDelete) {
    return (
      <RowActions
        name={name}
        onEdit={visible.find((a) => a.kind === 'edit')?.onSelect}
        onDelete={visible.find((a) => a.kind === 'delete')?.onSelect}
      />
    );
  }
  return (
    <ActionMenu
      label={`Actions for ${name}`}
      actions={actions.map(({ kind, ...a }) =>
        kind === 'edit'
          ? { ...a, label: 'Edit', icon: Pencil }
          : kind === 'delete'
            ? { ...a, label: 'Delete', icon: Trash2, danger: true }
            : a,
      )}
    />
  );
}
