"use strict";

const Coupon = require("../models/Coupon");
const UserCoupon = require("../models/UserCoupon");
const User = require("../models/User");
const couponService = require("../services/couponService");
const { sendNotification } = require("../utils/appPushNotification");

// ─── ADMIN CONTROLLERS ────────────────────────────────────────────────────────

exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      isActive,
      couponType,
      userIds,
    } = req.body;

    if (!code || !discountType || discountValue === undefined) {
      return res.status(400).json({
        success: false,
        error: "Code, discountType, and discountValue are required",
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check unique code
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "Coupon code already exists" });
    }

    // Validations
    if (discountValue <= 0) {
      return res.status(400).json({
        success: false,
        error: "Discount value must be greater than 0",
      });
    }

    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({
        success: false,
        error: "Percentage discount cannot exceed 100%",
      });
    }

    if (discountType === "flat" && discountValue < 0) {
      return res
        .status(400)
        .json({ success: false, error: "Flat discount cannot be negative" });
    }

    if (minOrderAmount !== undefined && minOrderAmount < 0) {
      return res.status(400).json({
        success: false,
        error: "Minimum order amount cannot be negative",
      });
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res
        .status(400)
        .json({ success: false, error: "Start date cannot be after end date" });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      title: title || "",
      description: description || "",
      discountType,
      discountValue,
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount: maxDiscountAmount || null,
      startDate: startDate || null,
      endDate: endDate || null,
      usageLimit:
        usageLimit !== undefined && usageLimit !== ""
          ? Number(usageLimit)
          : null,
      isActive: isActive !== undefined ? isActive : true,
      couponType: couponType || "public",
    });

    // Handle initial user assignments if private
    if (
      coupon.couponType === "private" &&
      userIds &&
      Array.isArray(userIds) &&
      userIds.length > 0
    ) {
      const validUsers = await User.find({
        _id: { $in: userIds },
        role: "customer",
        status: "approved",
      }).select("_id");
      const validUserIds = validUsers.map((u) => u._id);

      if (validUserIds.length > 0) {
        const assignments = validUserIds.map((uid) => ({
          userId: uid,
          couponId: coupon._id,
          assignedBy: req.user?._id || null,
        }));
        await UserCoupon.insertMany(assignments);

        // Send notifications
        const payload = {
          title: "🎁 Exclusive Coupon Assigned to You!",
          body: `You have been gifted an exclusive coupon "${coupon.code}". Use it to get ${
            coupon.discountType === "percentage"
              ? `${coupon.discountValue}%`
              : `₹${coupon.discountValue}`
          } off!`,
          category: "discount",
          data: {
            couponId: coupon._id.toString(),
            couponCode: coupon.code,
          },
        };
        await sendNotification(
          validUserIds,
          payload,
          {},
          true,
          {},
          true
        )
      }
    }else{
        const payload = {
          title: "🎁 Exclusive Free Coupon Added!",
          body: `You have been gifted an exclusive coupon "${coupon.code}". Use it to get ${
            coupon.discountType === "percentage"
              ? `${coupon.discountValue}%`
              : `₹${coupon.discountValue}`
          } off!`,
          category: "discount",
          data: {
            couponId: coupon._id.toString(),
            couponCode: coupon.code,
          },
        };

        await sendNotification(
          [],
          payload,
          {},
          true,
          {},
          true
        )
    }

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error("[Coupon] createCoupon error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create coupon",
    });
  }
};

exports.getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("[Coupon] getCoupons error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch coupons" });
  }
};

exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, error: "Coupon not found" });
    }
    const assignments = await UserCoupon.find({ couponId: coupon._id }).select(
      "userId",
    );
    const assignedUserIds = assignments.map((a) => a.userId.toString());

    return res.status(200).json({ success: true, coupon, assignedUserIds });
  } catch (error) {
    console.error("[Coupon] getCouponById error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch coupon" });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      isActive,
      couponType,
      userIds,
    } = req.body;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, error: "Coupon not found" });
    }

    if (code) {
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== coupon.code) {
        const existing = await Coupon.findOne({ code: normalizedCode });
        if (existing) {
          return res
            .status(400)
            .json({ success: false, error: "Coupon code already exists" });
        }
        coupon.code = normalizedCode;
      }
    }

    if (couponType !== undefined) coupon.couponType = couponType;

    if (discountType !== undefined) coupon.discountType = discountType;

    if (discountValue !== undefined) {
      if (discountValue <= 0) {
        return res.status(400).json({
          success: false,
          error: "Discount value must be greater than 0",
        });
      }
      const type = discountType || coupon.discountType;
      if (type === "percentage" && discountValue > 100) {
        return res.status(400).json({
          success: false,
          error: "Percentage discount cannot exceed 100%",
        });
      }
      coupon.discountValue = discountValue;
    }

    if (title !== undefined) coupon.title = title;
    if (description !== undefined) coupon.description = description;
    if (minOrderAmount !== undefined) {
      if (minOrderAmount < 0) {
        return res.status(400).json({
          success: false,
          error: "Minimum order amount cannot be negative",
        });
      }
      coupon.minOrderAmount = minOrderAmount;
    }
    if (maxDiscountAmount !== undefined)
      coupon.maxDiscountAmount = maxDiscountAmount;

    const start = startDate !== undefined ? startDate : coupon.startDate;
    const end = endDate !== undefined ? endDate : coupon.endDate;
    if (start && end && new Date(start) > new Date(end)) {
      return res
        .status(400)
        .json({ success: false, error: "Start date cannot be after end date" });
    }

    if (startDate !== undefined) coupon.startDate = startDate || null;
    if (endDate !== undefined) coupon.endDate = endDate || null;
    if (usageLimit !== undefined)
      coupon.usageLimit = usageLimit !== "" ? Number(usageLimit) : null;
    if (isActive !== undefined) coupon.isActive = isActive;

    await coupon.save();

    // Handle user assignments updates if private
    if (coupon.couponType === "private" && userIds && Array.isArray(userIds)) {
      // Get current assignments
      const existing = await UserCoupon.find({ couponId: coupon._id });
      const existingIds = existing.map((e) => e.userId.toString());

      // Determine additions & deletions
      const toAdd = userIds.filter((uid) => !existingIds.includes(uid));
      const toRemove = existingIds.filter((uid) => !userIds.includes(uid));

      if (toRemove.length > 0) {
        await UserCoupon.deleteMany({
          couponId: coupon._id,
          userId: { $in: toRemove },
        });
      }

      if (toAdd.length > 0) {
        const validUsers = await User.find({
          _id: { $in: toAdd },
          role: "customer",
          status: "approved",
        }).select("_id");
        const validUserIds = validUsers.map((u) => u._id);

        if (validUserIds.length > 0) {
          const assignments = validUserIds.map((uid) => ({
            userId: uid,
            couponId: coupon._id,
            assignedBy: req.user?._id || null,
          }));
          await UserCoupon.insertMany(assignments);

          // Notify only the newly assigned users
          const payload = {
            title: "🎁 Exclusive Coupon Assigned to You!",
            body: `You have been gifted an exclusive coupon "${coupon.code}". Use it to get ${
              coupon.discountType === "percentage"
                ? `${coupon.discountValue}%`
                : `₹${coupon.discountValue}`
            } off!`,
            category: "discount",
            data: {
              couponId: coupon._id.toString(),
              couponCode: coupon.code,
            },
          };

          await sendNotification(validUserIds, payload,
            {
              createdBy: req.user?._id,
            },
            true,
            {},
            true
          )
        }
      }
    }else{
          const payload = {
            title: "🎁 Exclusive Free Coupon Added!",
            body: `You have been gifted an exclusive coupon "${coupon.code}". Use it to get ${
              coupon.discountType === "percentage"
                ? `${coupon.discountValue}%`
                : `₹${coupon.discountValue}`
            } off!`,
            category: "discount",
            data: {
              couponId: coupon._id.toString(),
              couponCode: coupon.code,
            },
          };

          await sendNotification([], payload,
            {
              createdBy: req.user?._id,
            },
            true,
            payload,
            false
          )

    }

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    console.error("[Coupon] updateCoupon error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update coupon",
    });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, error: "Coupon not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("[Coupon] deleteCoupon error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete coupon" });
  }
};

// ─── CUSTOMER / USER CONTROLLERS ──────────────────────────────────────────────

exports.getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    // Coupons expired more than 15 days ago are invisible to users entirely
    const cutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    // Only return PUBLIC, active coupons that:
    //  - have started (or have no startDate)
    //  - have not yet expired OR expired within the last 15 days
    const coupons = await Coupon.find({
      isActive: true,
      couponType: "public",
    })
      .select(
        "code title description discountType discountValue minOrderAmount maxDiscountAmount startDate endDate usageLimit usedCount couponType isActive",
      )
      .sort({ createdAt: -1 });

    // Filter out exhausted coupons
    const available = coupons.filter((c) => {
      if (c.usageLimit === null || c.usageLimit === undefined) return true;
      return c.usedCount < c.usageLimit;
    });

    return res.status(200).json({ success: true, coupons: available });
  } catch (error) {
    console.error("[Coupon] getAvailableCoupons error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch available coupons" });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code || orderAmount === undefined) {
      return res
        .status(400)
        .json({ success: false, error: "Code and orderAmount are required" });
    }

    const { coupon, discountAmount, finalAmount } =
      await couponService.validateAndCalculate(
        code,
        Number(orderAmount),
        req.user?._id,
      );

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        couponId: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        originalAmount: Number(orderAmount),
        discountAmount,
        finalAmount,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to apply coupon",
    });
  }
};

// ─── ASSIGN / USER PRIVATE COUPONS ───────────────────────────────────────────

exports.assignCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "User IDs are required and must be an array",
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, error: "Coupon not found" });
    }

    if (coupon.couponType !== "private") {
      return res.status(400).json({
        success: false,
        error: "Only private coupons can be assigned to users",
      });
    }

    // Filter out users who already have this coupon assigned
    const existingAssignments = await UserCoupon.find({
      couponId: coupon._id,
      userId: { $in: userIds },
    }).select("userId");
    const existingUserIds = existingAssignments.map((a) => a.userId.toString());
    const newUserIds = userIds.filter((uid) => !existingUserIds.includes(uid));

    if (newUserIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "All specified users are already assigned to this coupon",
      });
    }

    // Validate that these are active customers
    const validUsers = await User.find({
      _id: { $in: newUserIds },
      role: "customer",
      status: "approved",
    }).select("_id name");
    const validUserIds = validUsers.map((u) => u._id);

    if (validUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid active customers found to assign",
      });
    }

    // Create UserCoupon assignments
    const assignments = validUserIds.map((uid) => ({
      userId: uid,
      couponId: coupon._id,
      assignedBy: req.user?._id || null,
    }));
    await UserCoupon.insertMany(assignments);

    // Send notifications to these users
    const payload = {
      title: "🎁 Exclusive Coupon Assigned to You!",
      body: `You have been gifted an exclusive coupon "${coupon.code}". Use it to get ${
        coupon.discountType === "percentage"
          ? `${coupon.discountValue}%`
          : `₹${coupon.discountValue}`
      } off!`,
      category: "discount",
      data: {
        couponId: coupon._id.toString(),
        couponCode: coupon.code,
      },
    };

    await sendNotification(
      validUserIds,
      payload,
      {createdBy: req.user?._id || null},
      true,
      payload,
      true,
    )

    return res.status(200).json({
      success: true,
      message: `Coupon successfully assigned to ${validUserIds.length} users`,
    });
  } catch (error) {
    console.error("[Coupon] assignCoupon error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to assign coupon",
    });
  }
};

exports.getMyAssignedCoupons = async (req, res) => {
  try {
    const userId = req.user._id;

    // Today's date (without time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Remove coupons expired more than 15 days ago
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 15);

    const assignments = await UserCoupon.find({ userId })
      .populate({
        path: "couponId",
        select:
          "code title description discountType discountValue minOrderAmount maxDiscountAmount startDate endDate usageLimit usedCount couponType isActive",
        match: {
          $or: [{ endDate: null }, { endDate: { $gte: cutoff } }],
        },
      })
      .sort({ createdAt: -1 });

    const coupons = assignments
      .filter((a) => a.couponId)
      .map((a) => {
        const c = a.couponId.toObject();

        const isUsed = a.isUsed;

        // Normalize start date (00:00:00)
        let startDate = null;
        if (c.startDate) {
          startDate = new Date(c.startDate);
          startDate.setHours(0, 0, 0, 0);
        }

        // Normalize end date (23:59:59)
        let endDate = null;
        if (c.endDate) {
          endDate = new Date(c.endDate);
          endDate.setHours(23, 59, 59, 999);
        }

        const notStarted = startDate && today < startDate;

        const expired = endDate && new Date() > endDate;

        const exhausted =
          c.usageLimit !== null &&
          c.usageLimit !== undefined &&
          c.usedCount >= c.usageLimit;

        let status = "active";

        if (isUsed) {
          status = "used";
        } else if (!c.isActive) {
          status = "inactive";
        } else if (expired) {
          status = "expired";
        } else if (notStarted) {
          status = "upcoming";
        } else if (exhausted) {
          status = "exhausted";
        }

        return {
          ...c,
          assignedAt: a.createdAt,
          isUsed,
          status,
          usable: status === "active",
        };
      });

    return res.status(200).json({
      success: true,
      coupons,
    });
  } catch (error) {
    console.error("[Coupon] getMyAssignedCoupons error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch your coupons",
    });
  }
};

