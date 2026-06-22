const express = require("express")
const router = express.Router()

const { adminMiddleware } = require("../middleware/admin")
const adminController = require("../controllers/adminController")
const notificationController = require("../controllers/notificationController")
const couponController = require("../controllers/couponController")

router.get("/dashboard/stats", adminMiddleware, adminController.getDashboardStats)
router.get("/sales", adminMiddleware, adminController.getSalesAnalytics)
router.get("/users", adminMiddleware, adminController.getUserAnalytics)
router.get("/inventory", adminMiddleware, adminController.getInventoryReport)
router.get("/revenue", adminMiddleware, adminController.getRevenueReports)

router.put("/products/bulk-update", adminMiddleware, adminController.bulkUpdateProducts)
router.delete("/products/bulk-delete", adminMiddleware, adminController.bulkDeleteProducts)
router.put("/orders/bulk-status", adminMiddleware, adminController.bulkUpdateOrderStatus)
router.post("/notifications/broadcast", adminMiddleware, notificationController.broadcastAnnouncement)

// Coupon CRUD Routes
router.post("/coupons", adminMiddleware, couponController.createCoupon)
router.get("/coupons", adminMiddleware, couponController.getCoupons)
router.get("/coupons/:id", adminMiddleware, couponController.getCouponById)
router.put("/coupons/:id", adminMiddleware, couponController.updateCoupon)
router.delete("/coupons/:id", adminMiddleware, couponController.deleteCoupon)
router.post("/coupons/:id/assign", adminMiddleware, couponController.assignCoupon)

module.exports = router


