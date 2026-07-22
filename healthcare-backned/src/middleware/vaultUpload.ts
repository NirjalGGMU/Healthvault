import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type: only PDF, JPEG, and PNG files are allowed'));
  }
};

// Memory storage: the controller encrypts the buffer and writes it to disk
// itself under a random UUID filename — multer never writes the plaintext
// file, and the original filename never touches the filesystem.
const vaultUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

export const vaultUploads = {
  single: (fieldName: string) => vaultUpload.single(fieldName),
};
