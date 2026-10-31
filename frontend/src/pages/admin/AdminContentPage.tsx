import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  blockActionApi,
  contentActionApi,
  deleteContentApi,
  listBlocksAdminApi,
  listContentApi,
  reorderContentApi,
  type AdminBlock,
  type ContentRow,
} from '../../api/adminApi';
import { RowMenu } from '../../components/admin/RowActions';
import { BlockDrawer } from '../../components/admin/BlockDrawer';
import { blocks, resources, type BlockDef, type ResourceDef } from '../../components/admin/contentConfig';
import { ContentFormDrawer } from '../../components/admin/ContentFormDrawer';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Async } from '../../components/ui/Async';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { t } from '../../i18n';

function BlocksPanel() {
  const can = useCan();
  const list = useFetch('admin-blocks', listBlocksAdminApi);
  const { run } = useRunner(list.retry);
  const [editing, setEditing] = useState<BlockDef | null>(null);

  return (
    <Async data={list.data} loading={list.initialLoading} error={list.error} onRetry={list.retry} skeleton={<Skeleton className="h-72" />}>
      {(data) => {
        const byKey = new Map<string, AdminBlock>(data.map((b) => [b.key, b]));
        const rows = blocks.map((def) => ({ def, block: byKey.get(def.key) }));
        const columns: Column<{ def: BlockDef; block: AdminBlock | undefined }>[] = [
          {
            header: t('Text block'),
            cell: ({ def }) => (
              <div>
                <p className="font-medium text-text">{t(def.label)}</p>
                <p className="text-xs text-text-muted">{t(def.where)}</p>
              </div>
            ),
          },
          { header: t('Status'), cell: ({ block }) => <StatusBadge status={block && block.status !== 'empty' ? block.status : 'draft'} /> },
          { header: t('Written'), className: 'text-text-muted', cell: ({ block }) => (block && block.status !== 'empty' ? t('Updated {date}', { date: formatDateTime(block.updatedAt ?? '') }) : t('Not written yet')) },
          {
            header: t('Actions'),
            srOnlyHeader: true,
            className: 'text-right',
            cell: ({ def, block }) => {
              const written = block && block.status !== 'empty';
              // Without publish rights a live block is read-only (the server enforces this too).
              const editable = can('content.manage') && (!written || block.status !== 'published' || can('content.publish'));
              return (
                <RowMenu
                  name={def.label}
                  actions={[
                    { label: t('Edit'), kind: 'edit', show: editable, onSelect: () => setEditing(def) },
                    { label: t('Publish'), show: can('content.publish') && Boolean(written) && block?.status !== 'published', onSelect: () => void run(() => blockActionApi(def.key, 'publish'), t('Published.')) },
                    { label: t('Unpublish'), show: can('content.publish') && block?.status === 'published', onSelect: () => void run(() => blockActionApi(def.key, 'unpublish'), t('Moved back to draft.')) },
                  ]}
                />
              );
            },
          },
        ];
        return (
          <>
            <DataTable caption={t('Page text blocks')} columns={columns} rows={rows} rowKey={(r) => r.def.key} minWidth={640} />
            <BlockDrawer def={editing} block={editing ? byKey.get(editing.key) : undefined} allBlocks={data} onClose={() => setEditing(null)} onSaved={list.retry} />
          </>
        );
      }}
    </Async>
  );
}

function ResourcePanel({ def }: { def: ResourceDef }) {
  const can = useCan();
  const list = useFetch(`admin-content:${def.key}`, () => listContentApi(def.key, { limit: 100 }));
  const { busy, run } = useRunner(list.retry);
  const [editing, setEditing] = useState<ContentRow | null | 'new'>(null);
  const [deleting, setDeleting] = useState<ContentRow | null>(null);

  const rows = list.data?.items;
  const publisher = can('content.publish');
  const editable = (r: ContentRow) => can('content.manage') && (r.status === 'draft' || publisher);

  const move = (index: number, by: -1 | 1) => {
    if (!rows) return;
    const ids = rows.map((r) => r.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    void run(() => reorderContentApi(def.key, ids), t('Order saved.'));
  };

  const columns: Column<ContentRow>[] = [
    {
      header: t(def.singular[0]!.toUpperCase() + def.singular.slice(1)),
      cell: (r) => (
        <div className="max-w-md">
          <p className="truncate font-medium text-text">{def.title(r)}</p>
          <p className="truncate text-xs text-text-muted">{def.subtitle(r)}</p>
        </div>
      ),
    },
    { header: t('Status'), cell: (r) => <StatusBadge status={r.status} /> },
    {
      header: t('Actions'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (r) => {
        const index = rows?.findIndex((x) => x.id === r.id) ?? 0;
        return (
          <RowMenu
            name={def.title(r)}
            actions={[
              { label: t('Edit'), kind: 'edit', show: editable(r), onSelect: () => setEditing(r) },
              { label: t('Publish'), show: publisher && r.status !== 'published', onSelect: () => void run(() => contentActionApi(def.key, r.id, 'publish'), t('Published.')) },
              { label: t('Unpublish'), show: publisher && r.status === 'published', onSelect: () => void run(() => contentActionApi(def.key, r.id, 'unpublish'), t('Moved back to draft.')) },
              { label: t('Archive'), show: publisher && r.status === 'published', onSelect: () => void run(() => contentActionApi(def.key, r.id, 'archive'), t('Archived.')) },
              { label: t('Move up'), show: publisher && index > 0, onSelect: () => move(index, -1) },
              { label: t('Move down'), show: publisher && rows !== undefined && index < rows.length - 1, onSelect: () => move(index, 1) },
              { label: t('Delete'), kind: 'delete', danger: true, show: publisher, onSelect: () => setDeleting(r) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      {can('content.manage') && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('New {item}', { item: t(def.singular) })}
          </Button>
        </div>
      )}
      <DataTable
        caption={t(def.plural)}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        minWidth={560}
        empty={<EmptyState title={t('No {items} yet', { items: t(def.plural).toLowerCase() })} description={t('Create the first one. It stays a draft until you publish it.')} />}
      />
      <ContentFormDrawer def={def} open={editing !== null} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list.retry} />
      <ConfirmDialog
        open={deleting !== null}
        title={t('Delete this {item}?', { item: t(def.singular) })}
        confirmLabel={t('Delete')}
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (deleting) void run(() => deleteContentApi(def.key, deleting.id), t('Deleted.')).then((ok) => ok && setDeleting(null));
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting ? t('“{title}” will be removed from the site.', { title: def.title(deleting) }) : ''}
      </ConfirmDialog>
    </>
  );
}

export default function AdminContentPage() {
  const [tab, setTab] = useState<'blocks' | ResourceDef['key']>('blocks');
  const def = resources.find((r) => r.key === tab);
  return (
    <>
      <PageHeader title={t('Site content')} description={t('Edit what visitors read. Nothing appears on the site until it is published.')} />
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label={t('Kind of content')}>
        <Chip active={tab === 'blocks'} onClick={() => setTab('blocks')}>
          {t('Page text')}
        </Chip>
        {resources.map((r) => (
          <Chip key={r.key} active={tab === r.key} onClick={() => setTab(r.key)}>
            {t(r.plural)}
          </Chip>
        ))}
      </div>
      {def ? <ResourcePanel key={def.key} def={def} /> : <BlocksPanel />}
    </>
  );
}
