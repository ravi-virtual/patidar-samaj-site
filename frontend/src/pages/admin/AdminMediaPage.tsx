import { useRef, useState } from 'react';
import { FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { deleteMediaApi, listMediaApi, updateMediaApi, uploadMediaApi, type MediaItem } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Modal } from '../../components/overlays/Modal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { SelectField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { Skeleton } from '../../components/ui/Skeleton';
import { TextField } from '../../components/ui/TextField';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

const PAGE_SIZE = 24;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_DOC = 10 * 1024 * 1024;

const readableSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function EditBody({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const dispatch = useAppDispatch();
  const [alt, setAlt] = useState(item.altText ?? '');
  const [visibility, setVisibility] = useState(item.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await updateMediaApi(item.id, { altText: alt.trim() || null, visibility });
      dispatch(showToast('Saved.'));
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-text-muted">{item.name}</p>
        {item.kind === 'image' && (
          <TextField
            label="Description of the picture (alt text)"
            hint="Read aloud by screen readers. Describe what the picture shows."
            maxLength={200}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            error={error}
          />
        )}
        <SelectField label="Who can open this file" value={visibility} onChange={(e) => setVisibility(e.target.value as MediaItem['visibility'])}>
          <option value="public">Anyone with the link</option>
          <option value="private">Signed-in staff only</option>
        </SelectField>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void save()} loading={busy}>
          Save
        </Button>
      </div>
    </>
  );
}

export default function AdminMediaPage() {
  const dispatch = useAppDispatch();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);
  const list = useFetch(`admin-media:${term}:${kind}:${page}`, () => listMediaApi({ search: term, kind, page, limit: PAGE_SIZE }));
  const { busy, run } = useRunner(list.retry);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const isPdf = file.type === 'application/pdf';
    if (file.size > (isPdf ? MAX_DOC : MAX_IMAGE)) {
      dispatch(showToast(`That file is too large. Pictures can be up to 5 MB and PDFs up to 10 MB.`, 'error'));
      return;
    }
    setUploading(true);
    try {
      await uploadMediaApi(file);
      dispatch(showToast('Uploaded. Add a description of the picture so it is accessible.'));
      list.retry();
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Upload failed'), 'error'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <PageHeader title="Media library" description="Pictures and PDFs used on the site. JPEG, PNG, WebP (up to 5 MB) and PDF (up to 10 MB)." />
      <Toolbar
        search={search}
        onSearch={(v) => (setSearch(v), setPage(1))}
        searchLabel="Search files"
        actions={
          can('media.upload') && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                aria-label="Choose a file to upload"
                tabIndex={-1}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <Button onClick={() => fileInput.current?.click()} loading={uploading}>
                <Upload aria-hidden="true" className="h-4 w-4" />
                Upload file
              </Button>
            </>
          )
        }
      >
        <FilterSelect label="Type" value={kind} onChange={(v) => (setKind(v), setPage(1))} options={[{ value: '', label: 'All files' }, { value: 'image', label: 'Pictures' }, { value: 'document', label: 'PDFs' }]} />
      </Toolbar>

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : !list.data ? (
        <Skeleton className="h-72" />
      ) : list.data.media.length === 0 ? (
        <EmptyState title="No files yet" description="Upload a picture or PDF to use it on events, history and the committee page." />
      ) : (
        <ul className={`m-0 grid list-none gap-3.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] ${list.loading ? 'opacity-60' : ''}`}>
          {list.data.media.map((m) => (
            <li key={m.id}>
              <Card padded={false} className="flex h-full flex-col overflow-hidden">
                {m.kind === 'image' ? (
                  <img src={m.url} alt={m.altText ?? ''} loading="lazy" className="h-32 w-full object-cover" />
                ) : (
                  <div aria-hidden="true" className="flex h-32 items-center justify-center bg-surface-muted text-text-muted">
                    <FileText className="h-9 w-9" />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="truncate text-sm font-medium" title={m.name}>
                    {m.name}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                    {readableSize(m.size)}
                    {m.visibility === 'private' && <Badge tone="warning">Staff only</Badge>}
                    {m.kind === 'image' && !m.altText && <Badge tone="warning">No description</Badge>}
                  </p>
                  <div className="mt-auto flex gap-1.5 pt-1.5">
                    {can('media.upload') && (
                      <Button variant="secondary" size="sm" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                    {can('content.publish') && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(m)} aria-label={`Delete ${m.name}`}>
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="File details">
        {editing && <EditBody key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={list.retry} />}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this file?"
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (deleting) void run(() => deleteMediaApi(deleting.id), 'File deleted.').then((ok) => ok && setDeleting(null));
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting ? `“${deleting.name}” will be deleted. This is blocked while an event, page or setting still uses it.` : ''}
      </ConfirmDialog>
    </>
  );
}
