import multer from 'multer';
import { config } from '../config/constants';

/**
 * Reads exactly one file (form field "file") into memory so its real content can be checked
 * before anything is written to disk. Hard limits stop oversized or multi-file requests early.
 * Nothing here trusts the filename or the declared type; see utils/fileType.ts.
 */
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(config.uploads.maxImageBytes, config.uploads.maxDocumentBytes),
    files: 1,
    fields: 5,
    parts: 8,
    fieldSize: 1024,
  },
}).single('file');

export default uploadSingle;
