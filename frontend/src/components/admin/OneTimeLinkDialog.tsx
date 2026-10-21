import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { Modal } from '../overlays/Modal';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

/**
 * Shows a one-time setup or reset link. There is no email provider, so the administrator hands the
 * link to the person. It is displayed once, is not stored in the browser, and expires on the server.
 */
export function OneTimeLinkDialog({
  link,
  title,
  onClose,
}: {
  link: { url: string; expiresAt: string; for: string } | null;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is selectable in the field below.
    }
  };

  return (
    <Modal
      open={link !== null}
      onClose={onClose}
      title={title}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {link && (
        <div className="space-y-3 px-5 py-4 text-sm">
          <Alert tone="warning">
            Copy this link now and give it to {link.for} yourself. It is shown only once and works a single time.
          </Alert>
          <label className="block text-[13px] font-medium" htmlFor="one-time-link">
            Link
          </label>
          <div className="flex gap-2">
            <input
              id="one-time-link"
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-bg px-3 font-mono text-xs"
            />
            <Button variant="secondary" onClick={() => void copy()} aria-label="Copy link">
              {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-text-muted">Expires {formatDateTime(link.expiresAt)}.</p>
        </div>
      )}
    </Modal>
  );
}
