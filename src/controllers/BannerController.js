const Banner = require("../models/banner");
const { deleteFile, buildUrl } = require("../config/multer");

// const { sendToDevice } = require("../utils/appPushNotification");

// ── Internal helpers ──────────────────────────────────────────────────────────

const buildImageObj = (file) => ({
  filename: file.filename, // cloudinary public_id
  originalName: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
  url: file.path, // cloudinary returns full URL in file.path
});

const getPublicBaseUrl = (req) => {
  const configuredBase = process.env.BASE_URL;
  if (configuredBase) return configuredBase.replace(/\/+$/, "");

  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
};

const serializeBanner = (_req, banner) => {
  return typeof banner.toObject === "function"
    ? banner.toObject()
    : { ...banner };
};

const serializeBanners = (req, banners) =>
  banners.map((banner) => serializeBanner(req, banner));

const pickFields = (body) => {
  const allowed = [
    "heading",
    "subheading",
    "link",
    "position",
    "status",
    "startDate",
    "endDate",
    "product_id",
  ];
  return allowed.reduce((acc, key) => {
    if (body[key] !== undefined)
      acc[key] =
        body[key] ||
        (key === "startDate" || key === "endDate" ? null : body[key]);
    return acc;
  }, {});
};

// ── GET /api/banners ──────────────────────────────────────────────────────────
const getAllBanners = async (req, res) => {
  try {
    const {
      status,
      position,
      live,
      page = 1,
      limit = 20,
      sort = "-createdAt",
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (position) filter.position = position;

    if (live === "true") {
      const now = new Date();
      filter.status = "active";
      filter.$and = [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [banners, total] = await Promise.all([
      Banner.find(filter).sort(sort).skip(skip).limit(limitNum),
      Banner.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: serializeBanners(req, banners),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("getAllBanners error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch banners" });
  }
};

const getUserBanner = async (req, res) => {
  try {
    const banners = await Banner.find({ status: "active" });

    res.status(200).json({ success: true, banners });
  } catch (error) {
    console.error("getAllBanners error:", err?.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch banners" });
  }
};

// ── GET /api/banners/:id ──────────────────────────────────────────────────────
const getBannerById = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }
    res.json({ success: true, data: serializeBanner(req, banner) });
  } catch (err) {
    console.error("getBannerById error:", err);
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid banner ID" });
    }
    res.status(500).json({ success: false, message: "Failed to fetch banner" });
  }
};

// ── POST /api/banners ─────────────────────────────────────────────────────────
const createBanner = async (req, res) => {
  try {
    const data = pickFields(req.body);

    if (!data.heading || !data.heading.trim()) {
      if (req.file) deleteFile(req.file.filename);
      return res
        .status(400)
        .json({ success: false, message: "Heading is required" });
    }

    if (req.file) {
      data.image = buildImageObj(req.file);
    }

    const banner = await Banner.create(data);
    // await sendToTopic("all_users", {
    //   title: "🔥 New Offer Available",
    //   body: `${banner.heading}${banner.subheading ? '\n' + banner.subheading : ''}`,
    //   data: {
    //     type: "banner",
    //     bannerId: banner._id.toString(),
    //     category: resolveBannerCategory(banner),
    //   },
    // });

    res.status(201).json({
      success: true,
      message: "Banner created successfully",
      data: serializeBanner(req, banner),
    });
  } catch (err) {
    if (req.file) deleteFile(req.file.filename);
    console.error("createBanner error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create banner" });
  }
};

// ── PUT /api/banners/:id ──────────────────────────────────────────────────────
const updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      if (req.file) deleteFile(req.file.filename);
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    const data = pickFields(req.body);

    if (req.file) {
      const oldFilename = banner.image?.filename;
      data.image = buildImageObj(req.file);
      if (oldFilename) deleteFile(oldFilename); // delete old image from disk
    }

    const updated = await Banner.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true },
    );

    res.json({
      success: true,
      message: "Banner updated successfully",
      data: serializeBanner(req, updated),
    });
  } catch (err) {
    if (req.file) deleteFile(req.file.filename);
    console.error("updateBanner error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid banner ID" });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update banner" });
  }
};

// ── PATCH /api/banners/:id/status ────────────────────────────────────────────
const updateBannerStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be "active" or "inactive"',
      });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true },
    );

    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    res.json({
      success: true,
      message: `Banner status updated to "${status}"`,
      data: serializeBanner(req, banner),
    });
  } catch (err) {
    console.error("updateBannerStatus error:", err);
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid banner ID" });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update status" });
  }
};

// ── DELETE /api/banners/:id ───────────────────────────────────────────────────
const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    if (banner.image?.filename) deleteFile(banner.image.filename);
    await banner.deleteOne();

    res.json({
      success: true,
      message: "Banner deleted successfully",
      data: { id: req.params.id },
    });
  } catch (err) {
    console.error("deleteBanner error:", err);
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid banner ID" });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to delete banner" });
  }
};

// ── DELETE /api/banners/:id/image ─────────────────────────────────────────────
const deleteBannerImage = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });
    }

    if (banner.image?.filename) deleteFile(banner.image.filename);

    banner.image = {
      filename: null,
      originalName: null,
      mimetype: null,
      size: null,
      url: null,
    };
    await banner.save();

    res.json({
      success: true,
      message: "Banner image removed successfully",
      data: serializeBanner(req, banner),
    });
  } catch (err) {
    console.error("deleteBannerImage error:", err);
    if (err.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid banner ID" });
    }
    res.status(500).json({ success: false, message: "Failed to remove image" });
  }
};

const getActiveBanner = async (req, res) => {
  try {
    const activeBanners = await Banner.find({ status: "active" });

    res.json({
      success: true,
      message: "Active banners fetched successfully",
      data: activeBanners.map((banner) => serializeBanner(req, banner)),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch banners",
    });
  }
};

module.exports = {
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  updateBannerStatus,
  deleteBanner,
  deleteBannerImage,
  getActiveBanner,
  getUserBanner,
};

const resolveBannerCategory = (bannerLike) => {
  if (bannerLike.position === "category")
    return bannerLike.heading || "category";
  if (bannerLike.heading) return bannerLike.heading;
  return "featured products";
};

// const fun = async ()=>{

//   await sendToDevice('cfUkS7WSQgqHK9BAGaoqBo:APA91bE7x6JpNdEg7shCHoZyFV9_QWVn-ur10JOSmZ86-EVezcuPb21GCLXKE4DH4Y0O_x3KCx9gTsa4Dl5IDQkP_RMns-OVr_07dT-ZUnBeHsjQeLt_0xg', {
//     title: 'Order Placed',
//     body:  'Your order #1234 has been placed successfully.',
//     data:  { orderId: '1234', screen: 'OrderDetail' },
//   });
// }

// fun();
