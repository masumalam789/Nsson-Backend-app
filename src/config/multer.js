'use strict';

const multer      = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

cloudinary.api.ping()
  .then(result => console.log('✅ Cloudinary connected:', result))
  .catch(err  => console.error('❌ Cloudinary connection failed:', err.message));


const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'banners',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    public_id: (_req, file) => {
      const ext      = file.originalname.split('.').pop();
      const basename = file.originalname
        .replace(/\.[^/.]+$/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/gi, '')
        .slice(0, 40)
        .toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      return `banner-${basename}-${unique}`;
    },
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  const err = new Error('Only image files (JPEG, PNG, WEBP, GIF) are allowed');
  err.status = 400;
  cb(err, false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
});

const deleteFile = async (publicIdOrUrl) => {
  if (!publicIdOrUrl) return;
  try {
    // accept either a full URL or a public_id
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.startsWith('http')) {
      // extract public_id from URL  e.g. ".../banners/banner-xyz-123.jpg"
      const parts = publicIdOrUrl.split('/');
      const file  = parts.pop().split('.')[0];          // filename without ext
      const folder = parts.pop();                        // folder name
      publicId = `${folder}/${file}`;
    }
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Could not delete Cloudinary image:', err.message);
  }
};

const buildUrl = (publicIdOrUrl) => {
  if (!publicIdOrUrl) return '';
  // if already a full URL (cloudinary returns full URLs), return as-is
  if (publicIdOrUrl.startsWith('http')) return publicIdOrUrl;
  return cloudinary.url(publicIdOrUrl);
};

module.exports = { upload, deleteFile, buildUrl };
