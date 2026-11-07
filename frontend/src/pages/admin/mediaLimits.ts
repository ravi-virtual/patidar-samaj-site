// Mirrors the server's limits (backend config uploads). Cloudinary's free plan allows 10 MB per file,
// so both are within what it accepts; the server still re-checks before anything is sent on.
export const MAX_IMAGE = 3 * 1024 * 1024;
export const MAX_DOC = 10 * 1024 * 1024;

export const readableSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
