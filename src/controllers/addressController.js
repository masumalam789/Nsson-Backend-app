const { Address } = require('../config/db');
const User = require('../models/User')

// Get all addresses for a user
const getUserAddresses = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    
    res.json({
      message: 'Addresses retrieved successfully',
      addresses,
      total: addresses.length
    });
  } catch (error) {
    console.error('Get Addresses Error:', error);
    res.status(500).json({ error: 'Failed to retrieve addresses' });
  }
};

// Get address by ID
const getAddressById = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;
    
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }
    
    res.json({
      message: 'Address retrieved successfully',
      address
    });
  } catch (error) {
    console.error('Get Address Error:', error);
    res.status(500).json({ error: 'Failed to retrieve address' });
  }
};

// Create new address
const createAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fullName, phone, street, landmark, city, state, zipCode, country, addressType, isDefault } = req.body;

    // Basic validation
    if (!fullName || !phone || !street || !city || !state || !zipCode) {
      return res.status(400).json({ 
        error: 'Full name, phone, street, city, state, and zip code are required' 
      });
    }

    if(phone.length!==10){
      return res.status(400).json({error:"Phone No length should be Ten"})
    }

    // Check if user has any addresses
    const existingAddressCount = await Address.countDocuments({ userId });
    
    // If this is the first address OR isDefault is explicitly true, make it default
    let shouldBeDefault = existingAddressCount === 0 || isDefault === true;

    // If setting as default, unset all other default addresses FIRST
    if (shouldBeDefault) {
      await Address.updateMany(
        { userId, isDefault: true },
        { $set: { isDefault: false } }
      );
      console.log(`Unset default for user ${userId}`);
    }

    // Create new address
    const address = new Address({
      userId,
      fullName: fullName.trim(),
      phone: phone.trim(),
      street: street.trim(),
      landmark: landmark?.trim() || '',
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      country: country || 'India',
      addressType: addressType || 'home',
      isDefault: shouldBeDefault
    });

    await address.save();

    res.status(201).json({
      message: 'Address created successfully',
      address
    });
  } catch (error) {
    console.error('Create Address Error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Failed to create address',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update address
const updateAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;
    const { fullName, phone, street, landmark, city, state, zipCode, country, addressType, isDefault } = req.body;

    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Update fields
    if (fullName) address.fullName = fullName.trim();
    if (phone) address.phone = phone.trim();
    if (street) address.street = street.trim();
    if (landmark !== undefined) address.landmark = landmark.trim();
    if (city) address.city = city.trim();
    if (state) address.state = state.trim();
    if (zipCode) address.zipCode = zipCode.trim();
    if (country) address.country = country.trim();
    if (addressType) address.addressType = addressType;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await address.save();

    res.json({
      message: 'Address updated successfully',
      address
    });
  } catch (error) {
    console.error('Update Address Error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

// Delete address
const deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;
    
    const address = await Address.findOneAndDelete({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({
      message: 'Address deleted successfully',
      deletedAddress: address
    });
  } catch (error) {
    console.error('Delete Address Error:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
};

// Set default address
const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;
    
    const address = await Address.findOne({ _id: addressId, userId });
    
    if (!address) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Remove default from other addresses
    await Address.updateMany(
      { userId, isDefault: true, _id: { $ne: addressId } },
      { $set: { isDefault: false } }
    );

    // Set this address as default
    address.isDefault = true;
    await address.save();

    res.json({
      message: 'Address set as default successfully',
      address
    });
  } catch (error) {
    console.error('Set Default Address Error:', error);
    res.status(500).json({ error: 'Failed to set default address' });
  }
};

const getAllAddress = async (req, res) => {
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


// Export all functions
module.exports = {
  getUserAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getAllAddress
};