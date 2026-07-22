import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import DocumentModel from '../models/Document';
import logger from '../config/logger';
import { encryptBuffer, decryptBuffer } from '../utils/encryption';

export const VAULT_DIR = path.join(__dirname, '../../uploads/vault');

if (!fs.existsSync(VAULT_DIR)) {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
}

/**
 * POST /api/documents (auth required, multipart field "file")
 * Encrypts the uploaded buffer (AES-256-GCM) and writes it to disk under a
 * random UUID filename — the original name/extension never touches the
 * filesystem, which prevents path traversal and filename enumeration.
 */
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const storedName = uuidv4();
    const encrypted = encryptBuffer(req.file.buffer);
    await fsp.writeFile(path.join(VAULT_DIR, storedName), encrypted);

    const doc = await DocumentModel.create({
      ownerId: req.user.id,
      originalName: req.file.originalname,
      storedName,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    logger.info(`VAULT: user ${req.user.id} uploaded document ${String(doc._id)}`);

    res.status(201).json({
      message: 'Document uploaded',
      document: {
        _id: doc._id,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Upload document error: ${message}`);
    res.status(500).json({ message: 'Failed to upload document' });
  }
};

/**
 * GET /api/documents (auth required)
 * Lists the requester's own documents (metadata only), newest first.
 */
export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const documents = await DocumentModel.find({ ownerId: req.user.id })
      .select('originalName mimeType size createdAt')
      .sort({ createdAt: -1 });

    res.status(200).json({ count: documents.length, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`List documents error: ${message}`);
    res.status(500).json({ message: 'Failed to fetch documents' });
  }
};

/**
 * GET /api/documents/:id/download (auth required, owner only)
 */
export const downloadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid document id' });
      return;
    }

    const doc = await DocumentModel.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    if (String(doc.ownerId) !== req.user.id) {
      logger.warn(`VAULT: user ${req.user.id} denied download of document ${id} (not owner)`);
      res.status(403).json({ message: 'Forbidden: you do not own this document' });
      return;
    }

    let decrypted: Buffer;
    try {
      const encrypted = await fsp.readFile(path.join(VAULT_DIR, doc.storedName));
      decrypted = decryptBuffer(encrypted);
    } catch {
      logger.error(`VAULT: failed to read/decrypt document ${id} for user ${req.user.id}`);
      res.status(500).json({ message: 'Failed to retrieve document' });
      return;
    }

    logger.info(`VAULT: user ${req.user.id} downloaded document ${id}`);

    // Strip control/non-ASCII chars from the plain filename= fallback (avoids
    // header injection and quote-breakout); filename*= carries the accurate
    // original name for browsers that support RFC 5987 (all modern ones).
    const safeFallbackName = doc.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFallbackName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`
    );
    res.send(decrypted);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Download document error: ${message}`);
    res.status(500).json({ message: 'Failed to download document' });
  }
};

/**
 * DELETE /api/documents/:id (auth required, owner only)
 */
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid document id' });
      return;
    }

    const doc = await DocumentModel.findById(id);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    if (String(doc.ownerId) !== req.user.id) {
      logger.warn(`VAULT: user ${req.user.id} denied delete of document ${id} (not owner)`);
      res.status(403).json({ message: 'Forbidden: you do not own this document' });
      return;
    }

    await fsp.unlink(path.join(VAULT_DIR, doc.storedName)).catch(() => undefined);
    await doc.deleteOne();

    logger.info(`VAULT: user ${req.user.id} deleted document ${id}`);

    res.status(200).json({ message: 'Document deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Delete document error: ${message}`);
    res.status(500).json({ message: 'Failed to delete document' });
  }
};
