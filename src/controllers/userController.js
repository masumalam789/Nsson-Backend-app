'use strict';

const User = require('../models/User');
const notificationService = require('../services/notificationService');
const EmailService = require('../services/emailService');

function normalizeApprovalStatus(value) {
  return String(value || '').trim().toLowerCase();
}

async function sendApprovalStatusEmail(user, status) {
  const normalizedStatus = normalizeApprovalStatus(status);

  if (normalizedStatus === 'approved') {
    return EmailService.sendAccountApprovedEmail(user);
  }

  if (normalizedStatus === 'rejected') {
    return EmailService.sendAccountRejectedEmail(user);
  }

  return { success: true };
}

// ─── Get All Users (admin) ────────────────────────────────────────────────────

exports.getAllUsers = async (req, res) => {
  try {
    const { status, role, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (role)   filter.role   = role;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    return res.status(200).json({
      message: 'Users fetched successfully',
      total,
      page:    Number(page),
      pages:   Math.ceil(total / Number(limit)),
      users,
    });
  } catch (error) {
    console.error('[User] getAllUsers error:', error);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ─── Get Single User (admin) ──────────────────────────────────────────────────

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ message: 'User fetched successfully', user });
  } catch (error) {
    console.error('[User] getUserById error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// ─── Update User (admin) ──────────────────────────────────────────────────────

exports.updateUser = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, address, shopDetails, role, status, approvalStatus } = req.body;
    const requestedStatus = approvalStatus !== undefined ? approvalStatus : status;
    const normalizedStatus = requestedStatus !== undefined
      ? normalizeApprovalStatus(requestedStatus)
      : undefined;

    const existingUser = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate and check email uniqueness if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      const emailTaken = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: req.params.id } });
      if (emailTaken) {
        return res.status(409).json({ error: 'Email is already in use by another account' });
      }
    }

    const updateData = {};
    if (firstName !== undefined)  updateData.firstName = firstName.trim();
    if (lastName !== undefined)   updateData.lastName  = lastName.trim();
    if (phone !== undefined)      updateData.phone     = phone.trim();
    if (email !== undefined)      updateData.email     = email.toLowerCase().trim();
    if (address !== undefined)    updateData.address   = address ? address.trim() : '';
    if (role)                     updateData.role      = role;
    if (normalizedStatus)         updateData.status    = normalizedStatus;

    // Merge shopDetails sub-fields individually
    if (shopDetails) {
      if (shopDetails.shopName        !== undefined) updateData['shopDetails.shopName']        = shopDetails.shopName.trim();
      if (shopDetails.gstNumber       !== undefined) updateData['shopDetails.gstNumber']       = shopDetails.gstNumber.trim();
      if (shopDetails.businessAddress !== undefined) updateData['shopDetails.businessAddress'] = shopDetails.businessAddress.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    // runValidators: false — partial update, avoid full-doc pre-validate hook
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updateData, updatedAt: new Date() } },
      { new: true, runValidators: false }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (normalizedStatus && normalizedStatus !== existingUser.status) {
      const emailResult = await sendApprovalStatusEmail(user, normalizedStatus);
      if (!emailResult.success) {
        console.error('[User] approval status email failed:', emailResult.error);
      }

      if (normalizedStatus === 'approved') {
        await notificationService.notifyUser(
          user._id,
          {
            title: 'Account Approved',
            body: 'Your account has been approved. You can now place orders!',
            category: 'approved',
            data: { userId: user._id, status: user.status },
          },
          { createdBy: req.user?._id || null }
        );
      }

      if (normalizedStatus === 'rejected') {
        await notificationService.notifyUser(
          user._id,
          {
            title: 'Account Suspended',
            body: 'Your account access has been restricted. Contact support.',
            category: 'info',
            data: { userId: user._id, status: user.status },
          },
          { createdBy: req.user?._id || null }
        );
      }
    }

    return res.status(200).json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('[User] updateUser error:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
};

// ─── Update User Approval Status (admin) ─────────────────────────────────────

exports.updateUserApproval = async (req, res) => {
  try {
    const normalizedStatus = normalizeApprovalStatus(req.body.status);

    if (!['approved', 'rejected'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    const existingUser = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.status === normalizedStatus) {
      return res.status(400).json({ error: `User is already ${normalizedStatus}` });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: normalizedStatus, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    const emailResult = await sendApprovalStatusEmail(user, normalizedStatus);
    if (!emailResult.success) {
      console.error('[User] approval status email failed:', emailResult.error);
    }

    await notificationService.notifyUser(
      user._id,
      {
        title: normalizedStatus === 'approved' ? 'Account Approved' : 'Account Rejected',
        body: normalizedStatus === 'approved'
          ? 'Your account has been approved. You can now place orders!'
          : 'Your registration was rejected. Contact support for more information.',
        category: normalizedStatus === 'approved' ? 'approved' : 'info',
        data: {
          userId: user._id,
          status: user.status,
          reason: req.body.reason || null,
        },
      },
      { createdBy: req.user?._id || null }
    );

    return res.status(200).json({
      message: `User approval status updated to ${normalizedStatus}`,
      user,
    });
  } catch (error) {
    console.error('[User] updateUserApproval error:', error);
    return res.status(500).json({ error: 'Failed to update approval status' });
  }
};

// ─── Delete User (admin) ──────────────────────────────────────────────────────

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[User] deleteUser error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ─── Get Pending Users (admin) ────────────────────────────────────────────────

exports.getPendingUsers = async (req, res) => {
  try {
    const users = await User.find({ status: 'pending', role: 'customer' })
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: 'Pending users fetched successfully',
      count:   users.length,
      users,
    });
  } catch (error) {
    console.error('[User] getPendingUsers error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending users' });
  }
};

// ─── Approve User (admin) ─────────────────────────────────────────────────────

exports.approveUser = async (req, res) => {
  try {
    const existingUser = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.status === 'approved') {
      return res.status(400).json({ error: 'User is already approved' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', updatedAt: new Date() },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    const emailResult = await EmailService.sendAccountApprovedEmail(user);
    if (!emailResult.success) {
      console.error('[User] account approved email failed:', emailResult.error);
    }

    // await notificationService.notifyUser(
    //   user._id,
    //   {
    //     title: 'Account Approved',
    //     body: 'Your account has been approved. You can now place orders!',
    //     category: 'approved',
    //     data: { userId: user._id, status: user.status },
    //   },
    //   { createdBy: req.user?._id || null }
    // );

    return res.status(200).json({
      message: `${user.firstName} ${user.lastName}'s account has been approved. They can now log in.`,
      user,
    });
  } catch (error) {
    console.error('[User] approveUser error:', error);
    return res.status(500).json({ error: 'Failed to approve user' });
  }
};

// ─── Reject User (admin) ──────────────────────────────────────────────────────

exports.rejectUser = async (req, res) => {
  try {
    const existingUser = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.status === 'rejected') {
      return res.status(400).json({ error: 'User is already rejected' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', updatedAt: new Date() },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    const emailResult = await EmailService.sendAccountRejectedEmail(user);
    if (!emailResult.success) {
      console.error('[User] account rejected email failed:', emailResult.error);
    }

    await notificationService.notifyUser(
      user._id,
      {
        title: 'Account Suspended',
        body: 'Your account access has been restricted. Contact support.',
        category: 'info',
        data: { userId: user._id, status: user.status },
      },
      { createdBy: req.user?._id || null }
    );

    return res.status(200).json({
      message: `${user.firstName} ${user.lastName}'s account has been rejected.`,
      user,
    });
  } catch (error) {
    console.error('[User] rejectUser error:', error);
    return res.status(500).json({ error: 'Failed to reject user' });
  }
};

exports.getAllAddress = async (req, res) => {
  try {
    const user_id = req.user._id;

    if (!user_id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const addresses = await Address.find({ userId: user_id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
    });
  } catch (error) {
    console.error('------ ERROR WHILE FETCHING USER ADDRESS -----', error?.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};