'use strict';

const Discount = require('../models/Discount');
const { sendNotification } = require('../utils/appPushNotification');

exports.createDiscount = async (req, res) => {
  try {
    const { title, description, code, type, value, startsAt, endsAt, isActive, scope, targetName } = req.body;

    if (!title || value === undefined) {
      return res.status(400).json({ success: false, error: 'Title and value are required' });
    }

    const discount = await Discount.create({
      title,
      description,
      code,
      type,
      value,
      startsAt,
      endsAt,
      isActive,
      scope,
      targetName,
      createdBy: req.user?._id || null,
    });

    const resolvedTarget = targetName || title;
    const isSaleCampaign = (scope || 'campaign') === 'campaign';

    await sendNotification(
      [],
      { title: isSaleCampaign ? 'Sale Alert 🔥' : 'Special Offer',
        body: isSaleCampaign
          ? `Check out today's deals on ${resolvedTarget}.`
          : `${value}% off on ${resolvedTarget}. Limited time!`,
        category: 'discount',
        data: {
          discountId: discount._id,
          code: discount.code || '',
          type: discount.type,
          value: discount.value,
          scope: discount.scope,
          targetName: discount.targetName,
        }},
      { createdBy: req.user?._id || null },
      true,
      {},
      true,
    )

    return res.status(201).json({
      success: true,
      message: 'Discount created successfully',
      discount,
    });
  } catch (error) {
    console.error('[Discount] createDiscount error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create discount' });
  }
};

exports.getDiscounts = async (req, res) => {
  try {
    const discounts = await Discount.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, discounts });
  } catch (error) {
    console.error('[Discount] getDiscounts error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch discounts' });
  }
};
