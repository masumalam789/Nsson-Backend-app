const express = require("express")
const router = express.Router()

const { adminMiddleware } = require("../middleware/admin")
const adminController = require("../controllers/adminController")
const notificationController = require("../controllers/notificationController")

router.get("/dashboard/stats", adminMiddleware, adminController.getDashboardStats)
router.get("/sales", adminMiddleware, adminController.getSalesAnalytics)
router.get("/users", adminMiddleware, adminController.getUserAnalytics)
router.get("/inventory", adminMiddleware, adminController.getInventoryReport)
router.get("/revenue", adminMiddleware, adminController.getRevenueReports)

router.put("/products/bulk-update", adminMiddleware, adminController.bulkUpdateProducts)
router.delete("/products/bulk-delete", adminMiddleware, adminController.bulkDeleteProducts)
router.put("/orders/bulk-status", adminMiddleware, adminController.bulkUpdateOrderStatus)
router.post("/notifications/broadcast", adminMiddleware, notificationController.broadcastAnnouncement)

module.exports = router
