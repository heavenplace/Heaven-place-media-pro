import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Every audio and video format a station may publish, with the type a browser and a
 * phone player expect for it. A machine only names the file types it happens to know —
 * the same .opus or .flac arrives as `audio/ogg` on one and as `application/octet-stream`
 * (or with no type at all) on the next — so the extension decides what is accepted and
 * what is served, and the format a station picked is never lost to the machine it was
 * picked on. Documents and archives are still refused.
 */
export const MEDIA_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.spx': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.weba': 'audio/webm',
  '.mka': 'audio/x-matroska',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.amr': 'audio/amr',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.ts': 'video/mp2t',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv'
};

const MIME_FAMILY = /^(audio|video|image)\//;

const extensionOf = (name) => path.extname(name || '').toLowerCase();
const knownType = (name) => MEDIA_TYPES[extensionOf(name)] || null;

// What the uploader says the file is, else what its extension says it is.
function familyOf(file) {
  if (MIME_FAMILY.test(file.mimetype)) return file.mimetype.split('/')[0];
  const known = knownType(file.originalname);
  return known ? known.split('/')[0] : null;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^.\w]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (familyOf(file)) return cb(null, true);
    const error = new Error('Only audio, video or image files can be uploaded');
    error.status = 400;
    cb(error);
  }
});

const router = express.Router();

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    // The uploader's own type when it knew one, otherwise the type the extension gives —
    // never the `application/octet-stream` a machine that did not know the format sent.
    mime: MIME_FAMILY.test(req.file.mimetype) ? req.file.mimetype : knownType(req.file.originalname) || req.file.mimetype,
    size: req.file.size,
    name: req.file.originalname
  });
});

export default router;
