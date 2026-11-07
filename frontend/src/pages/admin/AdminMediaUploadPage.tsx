import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FileText, Upload } from 'lucide-react';
import { uploadMediaApi } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { FormPage, FullWidth } from '../../components/admin/FormPage';
import { useCan } from '../../components/admin/usePermissions';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { t } from '../../i18n';
import { compressImage } from './compressImage';
import { MAX_DOC, MAX_IMAGE, readableSize } from './mediaLimits';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** Full-page "Upload file": a description first, then the file with a preview. Nothing is sent until Save. */
export default function AdminMediaUploadPage() {
  const can = useCan();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const input = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const isPdf = file?.type === 'application/pdf';
  const previewUrl = useMemo(
    () => (file && !isPdf ? URL.createObjectURL(file) : null),
    [file, isPdf],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  if (!can('media.upload')) return <Navigate to="/admin/media" replace />;

  const choose = (picked: File | undefined) => {
    setError(undefined);
    if (!picked) return;
    // Checked here, before anything is sent, so an oversized file never reaches the storage service.
    const pdf = picked.type === 'application/pdf';
    if (picked.size > (pdf ? MAX_DOC : MAX_IMAGE)) {
      setFile(null);
      setFileError(t('That file is too large. Pictures can be up to 3 MB and PDFs up to 10 MB.'));
      if (input.current) input.current.value = '';
      return;
    }
    setFileError(undefined);
    setFile(picked);
  };

  const save = async () => {
    if (!file) {
      setFileError(t('Choose a file to upload'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await uploadMediaApi(await compressImage(file), description.trim() || undefined);
      dispatch(showToast(t('File uploaded.')));
      navigate('/admin/media');
    } catch (err) {
      setError(getErrorMessage(err, t('Upload failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPage
      title={t('Upload file')}
      description={t(
        'Pictures and PDFs used on the site. JPEG, PNG, WebP (up to 3 MB) and PDF (up to 10 MB).',
      )}
      backTo="/admin/media"
      backLabel={t('Back to media library')}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      submitLabel={t('Save')}
      submitting={busy}
    >
      {error && (
        <FullWidth>
          <Alert tone="danger">{error}</Alert>
        </FullWidth>
      )}
      <FullWidth>
        <TextField
          label={t('Description')}
          hint={t('Read aloud by screen readers. Describe what the picture shows.')}
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FullWidth>
      <FullWidth>
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-text">{t('File')}</p>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label={t('Choose a file to upload')}
            tabIndex={-1}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-muted p-6 text-center">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={description || file?.name || ''}
                className="max-h-64 max-w-full rounded-md object-contain"
              />
            )}
            {file && isPdf && (
              <div
                aria-hidden="true"
                className="flex h-24 w-24 items-center justify-center rounded-md bg-surface text-text-muted"
              >
                <FileText className="h-10 w-10" />
              </div>
            )}
            {file ? (
              <p className="text-sm text-text">
                {file.name} · <span className="text-text-muted">{readableSize(file.size)}</span>
              </p>
            ) : (
              <p className="text-sm text-text-muted">{t('No file chosen yet.')}</p>
            )}
            <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
              <Upload aria-hidden="true" className="h-4 w-4" />
              {file ? t('Choose a different file') : t('Choose a file')}
            </Button>
          </div>
          {fileError && (
            <p role="alert" className="text-[13px] text-danger">
              {fileError}
            </p>
          )}
        </div>
      </FullWidth>
    </FormPage>
  );
}
