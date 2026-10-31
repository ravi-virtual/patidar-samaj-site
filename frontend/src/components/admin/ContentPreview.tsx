import type { MouseEvent, ReactNode } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import type { AdminBlock } from '../../api/adminApi';
import { mediaUrl } from '../../api/siteApi';
import type { CommitteeMember, ContentBlock, ContentItem, Faq, ImportantLink, Milestone } from '../../api/types';
import { useAppSelector } from '../../store/hooks';
import { Modal } from '../overlays/Modal';
import {
  AboutContent,
  FaqItem,
  HeroCard,
  HistoryIntro,
  LinkCard,
  MemberCard,
  MilestoneEntry,
  StatsCard,
} from '../site/ContentViews';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import type { BlockDef, ResourceDef } from './contentConfig';
import { StatusBadge } from './StatusBadge';

/** The button that opens a preview. Lives inside the edit form. */
export function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <Eye aria-hidden="true" className="h-3.5 w-3.5" />
      Preview
    </Button>
  );
}

/**
 * Side panel showing unsaved form values rendered with the public site's own components.
 * Links inside are inert so a stray click cannot navigate away from the editor.
 */
function PreviewPanel({
  open,
  onClose,
  status,
  note,
  children,
}: {
  open: boolean;
  onClose: () => void;
  status: string;
  note?: string;
  children: ReactNode;
}) {
  const stopLinks = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preview — not saved yet"
      variant="drawer"
      footer={
        <Button variant="secondary" onClick={onClose}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to editing
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted px-5 py-2.5 text-[13px] text-text-muted">
        <StatusBadge status={status} />
        <span>{note ?? 'Shown as it will look on the public site. Nothing has been saved or published.'}</span>
      </div>
      <div className="p-5" onClickCapture={stopLinks}>
        {children}
      </div>
    </Modal>
  );
}

// ─── Page text blocks ────────────────────────────────────────────────────────

const ITEM_KEYS = ['title', 'text', 'value', 'label', 'imageMediaId'] as const;

/** Turns form values into the shape the public API returns for a block (empty text becomes null). */
const blockFromValues = (
  def: BlockDef,
  v: { title: string; body: string; items: Record<string, string>[] },
): ContentBlock => ({
  id: def.key,
  key: def.key,
  title: def.title ? (v.title ?? '').trim() || null : null,
  body: def.body ? (v.body ?? '').trim() || null : null,
  items: def.itemFields
    ? (v.items ?? []).map((item) => {
        const out: ContentItem = { title: null, text: null, value: null, label: null, imageMediaId: null };
        for (const k of ITEM_KEYS) out[k] = (item[k] ?? '').trim() || null;
        return out;
      })
    : [],
});

const asBlock = (b: AdminBlock): ContentBlock => ({
  id: b.key,
  key: b.key,
  title: b.title ?? null,
  body: b.body ?? null,
  items: (b.items ?? []) as ContentItem[],
});

function BlockPreviewBody({
  def,
  values,
  others,
}: {
  def: BlockDef;
  values: { title: string; body: string; items: Record<string, string>[] };
  /** The other saved blocks, so a page preview shows the edited block in place. */
  others: AdminBlock[];
}) {
  const settings = useAppSelector((s) => s.site.settings);
  const block = blockFromValues(def, values);

  if (def.key === 'home.welcome') {
    return (
      <div className="flex flex-col gap-4">
        <HeroCard
          title={block.title ?? settings?.name ?? ''}
          body={block.body ?? settings?.tagline ?? ''}
          image={mediaUrl(block.items[0]?.imageMediaId)}
        />
      </div>
    );
  }
  if (def.key === 'home.stats') {
    return <div className="flex flex-col gap-4">{block.items.length ? <StatsCard items={block.items} /> : <p className="text-sm text-text-muted">Nothing to show yet. Add a figure.</p>}</div>;
  }
  if (def.key === 'history.intro') {
    return <HistoryIntro intro={block} />;
  }
  // about.*
  const blocks: Record<string, ContentBlock> = {};
  for (const b of others) if (b.status !== 'empty' && b.key.startsWith('about.')) blocks[b.key] = asBlock(b);
  blocks[def.key] = block;
  return <AboutContent blocks={blocks} />;
}

const blockPreviewNote = (def: BlockDef): string | undefined =>
  def.key.startsWith('about.') ? 'The other sections show their latest saved text, drafts included.' : undefined;

// ─── Lists (FAQs, links, milestones, committee) ──────────────────────────────

type Values = Record<string, string | boolean>;
const str = (v: Values, k: string): string => String(v[k] ?? '').trim();

function ResourcePreviewBody({ def, values, termLabel }: { def: ResourceDef; values: Values; termLabel?: string }) {
  switch (def.key) {
    case 'faqs': {
      const faq: Faq = { id: 'preview', question: str(values, 'question'), answer: str(values, 'answer') };
      return (
        <Card padded={false}>
          <FaqItem f={faq} open />
        </Card>
      );
    }
    case 'links': {
      const link: ImportantLink = {
        id: 'preview',
        label: str(values, 'label'),
        description: str(values, 'description') || null,
        url: str(values, 'url') || null,
        fileMediaId: str(values, 'fileMediaId') || null,
        category: str(values, 'category') || 'Other',
      };
      return (
        <section aria-labelledby="preview-cat">
          <h2 id="preview-cat" className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-text-subtle">
            {link.category}
          </h2>
          <LinkCard link={link} />
        </section>
      );
    }
    case 'milestones': {
      const m: Milestone = {
        id: 'preview',
        periodLabel: str(values, 'periodLabel'),
        title: str(values, 'title'),
        text: str(values, 'text'),
        imageMediaId: str(values, 'imageMediaId') || null,
        sourceRef: str(values, 'sourceRef') || null,
      };
      return (
        <ol className="m-0 list-none p-0">
          <MilestoneEntry m={m} />
        </ol>
      );
    }
    case 'committee-members': {
      const m: CommitteeMember = {
        id: 'preview',
        termId: str(values, 'termId'),
        name: str(values, 'name'),
        position: str(values, 'position'),
        bio: str(values, 'bio') || null,
        imageMediaId: str(values, 'imageMediaId') || null,
      };
      return (
        <div className="space-y-4">
          <PageHeader eyebrow="Committee" title={termLabel ? `Committee ${termLabel}` : 'Committee'} />
          <MemberCard m={m} />
        </div>
      );
    }
    case 'committee-terms':
      return (
        <PageHeader
          eyebrow="Committee"
          title={`Committee ${str(values, 'label')}`.trim()}
          description={`${str(values, 'startYear')}–${str(values, 'endYear')}${values.isCurrent ? ' · current term' : ''}`}
        />
      );
    default:
      return null;
  }
}

// ─── Entry points used by the edit drawers ───────────────────────────────────

interface BlockValues {
  title: string;
  body: string;
  items: Record<string, string>[];
}

export function BlockPreview({
  open,
  onClose,
  def,
  values,
  others,
  status,
}: {
  open: boolean;
  onClose: () => void;
  def: BlockDef;
  values: BlockValues;
  others: AdminBlock[];
  status: string;
}) {
  return (
    <PreviewPanel open={open} onClose={onClose} status={status} note={blockPreviewNote(def)}>
      <BlockPreviewBody def={def} values={values} others={others} />
    </PreviewPanel>
  );
}

export function ResourcePreview({
  open,
  onClose,
  def,
  values,
  termLabel,
  status,
}: {
  open: boolean;
  onClose: () => void;
  def: ResourceDef;
  values: Values;
  termLabel?: string;
  status: string;
}) {
  return (
    <PreviewPanel open={open} onClose={onClose} status={status}>
      <ResourcePreviewBody def={def} values={values} termLabel={termLabel} />
    </PreviewPanel>
  );
}
