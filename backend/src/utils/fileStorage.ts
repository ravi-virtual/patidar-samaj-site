import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/constants';

type Kind = 'image' | 'document';

/** Local disk by default; Cloudinary when its credentials are configured. */
export const usesCloud = config.cloudinary.enabled;

if (usesCloud) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

// Everything is stored as an "authenticated" (private) Cloudinary asset, so a file can only be
// reached through a signed URL that this API hands out after its own visibility checks.
const resourceType = (kind: Kind) => (kind === 'image' ? 'image' : 'raw');
const extOf = (storedName: string) => storedName.slice(storedName.lastIndexOf('.') + 1);
// Images are addressed without an extension (it is a delivery format); raw files keep it.
const publicIdOf = (storedName: string, kind: Kind) =>
  `${config.cloudinary.folder}/${kind === 'image' ? storedName.slice(0, storedName.lastIndexOf('.')) : storedName}`;

export const storeFile = async (buffer: Buffer, storedName: string, kind: Kind): Promise<void> => {
  if (!usesCloud) {
    await mkdir(config.uploads.dir, { recursive: true });
    await writeFile(join(config.uploads.dir, storedName), buffer, { flag: 'wx', mode: 0o640 });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { public_id: publicIdOf(storedName, kind), resource_type: resourceType(kind), type: 'authenticated', overwrite: false },
        (err) => (err ? reject(err) : resolve()),
      )
      .end(buffer);
  });
};

export const removeFile = async (storedName: string, kind: Kind): Promise<void> => {
  if (!usesCloud) {
    await unlink(join(config.uploads.dir, storedName)).catch(() => undefined);
    return;
  }
  await cloudinary.uploader
    .destroy(publicIdOf(storedName, kind), { resource_type: resourceType(kind), type: 'authenticated', invalidate: true })
    .catch(() => undefined);
};

/** Signed delivery URL for a Cloudinary-stored file. */
export const signedUrl = (storedName: string, kind: Kind): string =>
  cloudinary.url(publicIdOf(storedName, kind), {
    resource_type: resourceType(kind),
    type: 'authenticated',
    sign_url: true,
    secure: true,
    ...(kind === 'image' ? { format: extOf(storedName) } : {}),
  });
