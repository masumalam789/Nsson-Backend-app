'use strict';

// ✅ Fixed imports — import models directly
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');
const notificationService = require('../services/notificationService');
const { sendNotification } = require('../utils/appPushNotification');

// ─── admin dashboard statistics ──────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    console.log('Dashboard stats called');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenueMatch = {
      status: { $ne: 'cancelled' },
      $or: [
        { paymentStatus: 'PAID' },
        { status: 'delivered' },
      ],
    };

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalCategories,
      pendingOrders,
      lowStockProducts,
      revenueStats,
      monthlyRevenueStats,
      orderStatusBreakdown,
      recentOrders,
      topSellingProducts,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Category.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Product.countDocuments({ stock: { $lt: 10 } }),
      Order.aggregate([
        { $match: revenueMatch },
        { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { ...revenueMatch, createdAt: { $gte: monthStart, $lte: now } } },
        { $group: { _id: null, monthlyRevenue: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.find()
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('_id orderNumber status paymentStatus total userId createdAt'),
      Order.aggregate([
        { $match: revenueMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            productName: { $first: '$items.name' },
            totalUnitsSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const totalRevenue = Number((revenueStats[0]?.totalRevenue || 0).toFixed(2));
    const monthlyRevenue = Number((monthlyRevenueStats[0]?.monthlyRevenue || 0).toFixed(2));

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalCategories,
          pendingOrders,
          lowStockProducts,
          totalRevenue,
          monthlyRevenue,
        },
        orderStatusBreakdown,
        recentOrders,
        topSellingProducts,
      },
    });
  } catch (error) {
    console.error('Get Dashboard Stats Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve dashboard statistics' });
  }
};

// ─── Sales Analytics ──────────────────────────────────────
exports.getSalesAnalytics = async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    let dateFormat, matchStage = { status: 'delivered' };

    switch (period) {
      case 'daily':  dateFormat = '%Y-%m-%d'; break;
      case 'weekly': dateFormat = '%Y-%U';    break;
      case 'yearly': dateFormat = '%Y';       break;
      default:       dateFormat = '%Y-%m';
    }

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
      const defaultEndDate   = new Date();
      const defaultStartDate = new Date();
      switch (period) {
        case 'daily':  defaultStartDate.setDate(defaultEndDate.getDate() - 30);           break;
        case 'weekly': defaultStartDate.setDate(defaultEndDate.getDate() - 90);           break;
        case 'yearly': defaultStartDate.setFullYear(defaultEndDate.getFullYear() - 2);    break;
        default:       defaultStartDate.setFullYear(defaultEndDate.getFullYear() - 1);
      }
      matchStage.createdAt = { $gte: defaultStartDate, $lte: defaultEndDate };
    }

    const salesTrends = await Order.aggregate([
      { $match: matchStage },
      { $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          totalSales: { $sum: '$total' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$total' },
          uniqueCustomers: { $addToSet: '$userId' },
      }},
      { $project: {
          period: '$_id', totalSales: 1, orderCount: 1,
          averageOrderValue: { $round: ['$averageOrderValue', 2] },
          uniqueCustomers: { $size: '$uniqueCustomers' },
      }},
      { $sort: { period: 1 } },
    ]);

    const productPerformance = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          totalUnitsSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          averagePrice: { $avg: '$items.price' },
          orderCount: { $addToSet: '$_id' },
      }},
      { $project: {
          productName: 1, totalUnitsSold: 1, totalRevenue: 1,
          averagePrice: { $round: ['$averagePrice', 2] },
          orderCount: { $size: '$orderCount' },
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    const categoryPerformance = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: {
          _id: '$product.category',
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalUnitsSold: { $sum: '$items.quantity' },
          averagePrice: { $avg: '$items.price' },
          uniqueProducts: { $addToSet: '$items.productId' },
          orderCount: { $addToSet: '$_id' },
      }},
      { $project: {
          category: '$_id', totalRevenue: 1, totalUnitsSold: 1,
          averagePrice: { $round: ['$averagePrice', 2] },
          uniqueProductsCount: { $size: '$uniqueProducts' },
          orderCount: { $size: '$orderCount' },
      }},
      { $sort: { totalRevenue: -1 } },
    ]);

    const totalCategoryRevenue = categoryPerformance.reduce((sum, cat) => sum + cat.totalRevenue, 0);
    const categoriesWithShare  = categoryPerformance.map(cat => ({
      ...cat,
      marketShare: totalCategoryRevenue > 0
        ? Number(((cat.totalRevenue / totalCategoryRevenue) * 100).toFixed(2))
        : 0,
    }));

    const customerStats = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: '$userId', totalOrders: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
      { $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          averageOrdersPerCustomer: { $avg: '$totalOrders' },
          averageCustomerValue: { $avg: '$totalSpent' },
          repeatCustomers: { $sum: { $cond: [{ $gt: ['$totalOrders', 1] }, 1, 0] } },
      }},
    ]);

    const customerBehavior = customerStats[0] ? {
      totalCustomers: customerStats[0].totalCustomers,
      averageOrdersPerCustomer: Number(customerStats[0].averageOrdersPerCustomer.toFixed(2)),
      averageCustomerValue: Number(customerStats[0].averageCustomerValue.toFixed(2)),
      repeatCustomerRate: customerStats[0].totalCustomers > 0
        ? Number(((customerStats[0].repeatCustomers / customerStats[0].totalCustomers) * 100).toFixed(2))
        : 0,
    } : { totalCustomers: 0, averageOrdersPerCustomer: 0, averageCustomerValue: 0, repeatCustomerRate: 0 };

    const summary = salesTrends.reduce(
      (stats, p) => ({ totalSales: stats.totalSales + p.totalSales, totalOrders: stats.totalOrders + p.orderCount }),
      { totalSales: 0, totalOrders: 0 }
    );

    res.json({
      success: true,
      data: {
        period,
        dateRange: { startDate: matchStage.createdAt.$gte, endDate: matchStage.createdAt.$lte },
        summary: {
          totalSales: summary.totalSales,
          totalOrders: summary.totalOrders,
          averageOrderValue: summary.totalOrders > 0 ? Number((summary.totalSales / summary.totalOrders).toFixed(2)) : 0,
          totalProducts: productPerformance.length,
          totalCategories: categoriesWithShare.length,
        },
        salesTrends,
        productPerformance,
        categoryPerformance: categoriesWithShare,
        customerBehavior,
        insights: {
          topProduct:  productPerformance[0] || null,
          topCategory: categoriesWithShare[0] || null,
          bestPeriod:  salesTrends.reduce((best, current) => current.totalSales > (best?.totalSales || 0) ? current : best, null),
        },
      },
    });
  } catch (error) {
    console.error('Get Sales Analytics Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve sales analytics', details: error.message });
  }
};

// ─── User Analytics ───────────────────────────────────────
exports.getUserAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'customer' });
    res.json({ success: true, data: { userGrowth: [], totalUsers } });
  } catch (error) {
    console.error('Get User Analytics Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve user analytics' });
  }
};

// ─── Bulk Update Products ─────────────────────────────────
exports.bulkUpdateProducts = async (req, res) => {
  try {
    const { productIds, updateData } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0)
      return res.status(400).json({ success: false, error: 'Product IDs array is required and cannot be empty' });

    if (!updateData || typeof updateData !== 'object' || Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, error: 'Update data object is required and cannot be empty' });

    const allowedFields  = ['name', 'price', 'description', 'category', 'stock', 'sizes', 'colors', 'featured', 'discount'];
    const invalidFields  = Object.keys(updateData).filter(f => !allowedFields.includes(f));
    if (invalidFields.length > 0)
      return res.status(400).json({ success: false, error: `Invalid fields: ${invalidFields.join(', ')}`, allowedFields });

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: { ...updateData, updatedAt: new Date() } }
    );

    if (updateData.discount !== undefined && Number(updateData.discount) > 0) {
      const sampleProduct = await Product.findOne({ _id: { $in: productIds } }).select('name category');
      const targetName = sampleProduct?.category || sampleProduct?.name || 'selected products';

      // await notificationService.notifyAllCustomers(
      //   {
      //     title: 'Special Offer',
      //     body: `${Number(updateData.discount)}% off on ${targetName}. Limited time!`,
      //     category: 'discount',
      //     data: {
      //       discount: Number(updateData.discount),
      //       productCount: productIds.length,
      //       targetName,
      //     },
      //   },
      //   { createdBy: req.user?._id || null }
      // );
      const result = await sendNotification(
        null,
        {
          title: 'Special Offer',
          body: `${Number(updateData.discount)}% off on ${targetName}. Limited time!`,
          category: 'discount',
          data: {
            discount: Number(updateData.discount),
            productCount: productIds.length,
            targetName,
          },
        },
        { createdBy: req.user?._id || null },
        true, // send_push_notification
        {},
        true, // create_notification_entry
      );
    }

    res.json({ success: true, message: `${result.modifiedCount} products updated successfully`, data: { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount } });
  } catch (error) {
    console.error('Bulk Update Products Error:', error);
    res.status(500).json({ success: false, error: 'Failed to bulk update products', details: error.message });
  }
};

// ─── Bulk Delete Products ─────────────────────────────────
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0)
      return res.status(400).json({ success: false, error: 'Product IDs array is required and cannot be empty' });

    const productsToDelete = await Product.find({ _id: { $in: productIds } });
    const fs   = require('fs');
    const path = require('path');

    productsToDelete.forEach(product => {
      (product.images || []).forEach(imagePath => {
        try {
          const fullPath = path.join(__dirname, '../../', imagePath.replace(/^\//, ''));
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (e) { console.error('Error deleting image:', e.message); }
      });
    });

    const result = await Product.deleteMany({ _id: { $in: productIds } });

    res.json({
      success: true,
      message: `${result.deletedCount} products deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        deletedProducts: productsToDelete.map(p => ({ id: p._id, name: p.name, imagesDeleted: p.images?.length || 0 })),
      },
    });
  } catch (error) {
    console.error('Bulk Delete Products Error:', error);
    res.status(500).json({ success: false, error: 'Failed to bulk delete products', details: error.message });
  }
};

// ─── Revenue Reports ──────────────────────────────────────
exports.getRevenueReports = async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    let dateFormat, matchStage = { status: 'delivered' };

    switch (period) {
      case 'daily':  dateFormat = '%Y-%m-%d'; break;
      case 'weekly': dateFormat = '%Y-%U';    break;
      case 'yearly': dateFormat = '%Y';       break;
      default:       dateFormat = '%Y-%m';
    }

    if (startDate && endDate) {
      matchStage.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else {
      const defaultEndDate   = new Date();
      const defaultStartDate = new Date();
      switch (period) {
        case 'daily':  defaultStartDate.setDate(defaultEndDate.getDate() - 30);        break;
        case 'weekly': defaultStartDate.setDate(defaultEndDate.getDate() - 90);        break;
        case 'yearly': defaultStartDate.setFullYear(defaultEndDate.getFullYear() - 2); break;
        default:       defaultStartDate.setFullYear(defaultEndDate.getFullYear() - 1);
      }
      matchStage.createdAt = { $gte: defaultStartDate, $lte: defaultEndDate };
    }

    const revenueData  = await Order.aggregate([
      { $match: matchStage },
      { $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          totalRevenue: { $sum: '$total' }, orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$total' }, minOrderValue: { $min: '$total' }, maxOrderValue: { $max: '$total' },
      }},
      { $sort: { _id: 1 } },
    ]);

    const overallStats    = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalOrders: { $sum: 1 }, averageOrderValue: { $avg: '$total' } } },
    ]);

    const dateRangeUsed   = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: null, minDate: { $min: '$createdAt' }, maxDate: { $max: '$createdAt' } } },
    ]);

    const dateRange = dateRangeUsed[0] || {};

    res.json({
      success: true,
      data: {
        period,
        dateRange: {
          startDate: dateRange.minDate ? dateRange.minDate.toISOString().split('T')[0] : 'No data',
          endDate:   dateRange.maxDate ? dateRange.maxDate.toISOString().split('T')[0] : 'No data',
        },
        revenueData,
        overallStats: overallStats[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
        note: revenueData.length === 0 ? 'No revenue data found. Make sure you have delivered orders.' : null,
      },
    });
  } catch (error) {
    console.error('Get Revenue Reports Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve revenue reports', details: error.message });
  }
};

// ─── Bulk Update Order Status ─────────────────────────────
exports.bulkUpdateOrderStatus = async (req, res) => {
  try {
    const { orderIds, status, notes } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0)
      return res.status(400).json({ success: false, error: 'Order IDs array is required' });

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status))
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });

    const result = await Order.updateMany(
      { _id: { $in: orderIds } },
      { $set: { status, updatedAt: new Date(), ...(notes && { adminNotes: notes }) } }
    );

    const updatedOrders = await Order.find({ _id: { $in: orderIds } })
      .select('_id orderNumber status total userId')
      .populate('userId', 'firstName lastName email');

    await Promise.all(
      updatedOrders.map((order) =>
        {
          const statusMessages = {
            processing: {
              title: 'Order Confirmed',
              body: `Order #${order.orderNumber || order._id} is being prepared for dispatch.`,
            },
            shipped: {
              title: 'Order Shipped',
              body: `Order #${order.orderNumber || order._id} is on the way! Track your delivery.`,
            },
            delivered: {
              title: 'Order Delivered',
              body: `Order #${order.orderNumber || order._id} has been delivered. Thank you!`,
            },
            cancelled: {
              title: 'Order Cancelled',
              body: `Order #${order.orderNumber || order._id} has been cancelled.`,
            },
          };

          const message = statusMessages[status];
          return message
            ? notificationService.notifyUser(
                order.userId?._id || order.userId,
                {
                  title: message.title,
                  body: message.body,
                  category: 'approved',
                  data: {
                    orderId: order._id,
                    status,
                  },
                },
                { createdBy: req.user?._id || null }
              )
            : Promise.resolve(null);
        }
      )
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} orders updated to "${status}" successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount:  result.matchedCount,
        updatedOrders: updatedOrders.map(o => ({
          id: o._id, orderNumber: o.orderNumber, status: o.status, total: o.total,
          customer: o.userId ? { name: `${o.userId.firstName} ${o.userId.lastName}`, email: o.userId.email } : null,
        })),
      },
    });
  } catch (error) {
    console.error('Bulk Update Order Status Error:', error);
    res.status(500).json({ success: false, error: 'Failed to bulk update order status', details: error.message });
  }
};

// ─── Inventory Report ─────────────────────────────────────
exports.getInventoryReport = async (req, res) => {
  try {
    const { lowStockThreshold = 10, includeOutOfStock = 'true' } = req.query;
    const threshold = parseInt(lowStockThreshold);

    let lowStockFilter = includeOutOfStock === 'true'
      ? { $or: [{ stock: { $lt: threshold, $gt: 0 } }, { stock: { $eq: 0 } }] }
      : { stock: { $lt: threshold, $gt: 0 } };

    const lowStockProducts = await Product.find(lowStockFilter)
      .select('name price stock images category createdAt').sort({ stock: 1 });

    const inventoryStats = await Product.aggregate([
      { $group: {
          _id: null,
          totalProducts:       { $sum: 1 },
          totalStockValue:     { $sum: { $multiply: ['$price', '$stock'] } },
          totalStockUnits:     { $sum: '$stock' },
          averageStock:        { $avg: '$stock' },
          outOfStock:          { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
          lowStock:            { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', threshold] }] }, 1, 0] } },
          healthyStock:        { $sum: { $cond: [{ $gt: ['$stock', threshold] }, 1, 0] } },
          highestPricedProduct:{ $max: '$price' },
          lowestPricedProduct: { $min: '$price' },
          averageProductPrice: { $avg: '$price' },
      }},
    ]);

    const categoryBreakdown = await Product.aggregate([
      { $group: {
          _id: '$category',
          productCount: { $sum: 1 }, totalStock: { $sum: '$stock' },
          totalValue: { $sum: { $multiply: ['$price', '$stock'] } },
          averageStock: { $avg: '$stock' },
          outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', threshold] }] }, 1, 0] } },
      }},
      { $sort: { totalValue: -1 } },
    ]);

    const outOfStockProducts = await Product.find({ stock: 0 }).select('name price category createdAt').sort({ createdAt: -1 });

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentlyUpdatedProducts = await Product.find({ updatedAt: { $gte: oneWeekAgo } })
      .select('name price stock category updatedAt').sort({ updatedAt: -1 }).limit(10);

    const stats = inventoryStats[0] || {};

    res.json({
      success: true,
      data: {
        summary: { lowStockThreshold: threshold, includeOutOfStock: includeOutOfStock === 'true', reportGenerated: new Date().toISOString() },
        inventoryStats: {
          totalProducts:   stats.totalProducts   || 0,
          totalStockUnits: stats.totalStockUnits  || 0,
          totalStockValue: Number((stats.totalStockValue || 0).toFixed(2)),
          averageStock:    Number((stats.averageStock    || 0).toFixed(1)),
          stockStatus:     { outOfStock: stats.outOfStock || 0, lowStock: stats.lowStock || 0, healthyStock: stats.healthyStock || 0 },
          priceAnalysis:   { highestPriced: Number((stats.highestPricedProduct || 0).toFixed(2)), lowestPriced: Number((stats.lowestPricedProduct || 0).toFixed(2)), averagePrice: Number((stats.averageProductPrice || 0).toFixed(2)) },
        },
        categoryBreakdown,
        products: { lowStock: lowStockProducts, outOfStock: outOfStockProducts, recentlyUpdated: recentlyUpdatedProducts },
        alerts: { critical: stats.outOfStock || 0, warning: stats.lowStock || 0, totalAlerts: (stats.outOfStock || 0) + (stats.lowStock || 0) },
      },
    });
  } catch (error) {
    console.error('Get Inventory Report Error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve inventory report', details: error.message });
  }
};
