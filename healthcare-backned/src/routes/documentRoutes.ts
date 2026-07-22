import { Router } from 'express';
import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  deleteDocument,
} from '../controllers/documentController';
import { protect } from '../middleware/authMiddleware';
import { vaultUploads } from '../middleware/vaultUpload';

const router = Router();

// Ambiguous in spec whether doctor/admin should also get a vault — the
// frontend only exposes this under /patient/, and ownership checks in the
// controller (ownerId === req.user.id) are the real security boundary, so
// this is left open to any authenticated role rather than role-restricted.
router.post('/', protect, vaultUploads.single('file'), uploadDocument);
router.get('/', protect, listDocuments);
router.get('/:id/download', protect, downloadDocument);
router.delete('/:id', protect, deleteDocument);

export default router;
