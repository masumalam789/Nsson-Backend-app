const { Wishlist, Product, Cart } = require('../config/db');

const getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const wishlistItems = await Wishlist.find({ userId })
      .populate('productId', 'name price images stock category sizes colors')
      .sort({ createdAt: -1 });
    
    const validWishlistItems = wishlistItems.filter(item => item.productId);
    
    res.json({
      message: 'Wishlist retrieved successfully',
      wishlist: validWishlistItems.map(item => ({
        _id: item._id,
        productId: item.productId._id,
        product: item.productId,
        addedAt: item.createdAt
      })),
      total: validWishlistItems.length
    });
  } catch (error) {
    console.error('Get Wishlist Error:', error);
    res.status(500).json({ error: 'Failed to retrieve wishlist' });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existingItem = await Wishlist.findOne({ userId, productId });
    if (existingItem) {
      return res.status(400).json({ 
        error: 'Product already in wishlist',
        wishlistItemId: existingItem._id
      });
    }

    const wishlistItem = new Wishlist({ userId, productId });
    await wishlistItem.save();
    await wishlistItem.populate('productId', 'name price images stock category sizes colors');

    res.status(201).json({
      message: 'Product added to wishlist successfully',
      wishlistItem: {
        _id: wishlistItem._id,
        productId: wishlistItem.productId._id,
        product: wishlistItem.productId,
        addedAt: wishlistItem.createdAt
      }
    });
  } catch (error) {
    console.error('Add to Wishlist Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Product already in wishlist' });
    }
    res.status(500).json({ error: 'Failed to add product to wishlist' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const wishlistItemId = req.params.id;
    
    const item = await Wishlist.findOneAndDelete({
      _id: wishlistItemId,
      userId: userId
    }).populate('productId', 'name images');
    
    if (!item) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }
    
    res.json({
      message: 'Item removed from wishlist successfully',
      removedItem: {
        _id: item._id,
        productId: item.productId ? item.productId._id : null,
        productName: item.productId ? item.productId.name : 'Product no longer available'
      }
    });
  } catch (error) {
    console.error('Remove from Wishlist Error:', error);
    res.status(500).json({ error: 'Failed to remove item from wishlist' });
  }
};

const removeFromWishlistByProductId = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    
    const item = await Wishlist.findOneAndDelete({
      productId: productId,
      userId: userId
    }).populate('productId', 'name images');
    
    if (!item) {
      return res.status(404).json({ error: 'Product not found in wishlist' });
    }
    
    res.json({
      message: 'Product removed from wishlist successfully',
      removedItem: {
        _id: item._id,
        productId: item.productId ? item.productId._id : null,
        productName: item.productId ? item.productId.name : 'Product no longer available'
      }
    });
  } catch (error) {
    console.error('Remove from Wishlist by Product ID Error:', error);
    res.status(500).json({ error: 'Failed to remove product from wishlist' });
  }
};

const checkWishlistStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    
    const item = await Wishlist.findOne({ userId, productId });
    
    res.json({
      inWishlist: !!item,
      wishlistItemId: item ? item._id : null
    });
  } catch (error) {
    console.error('Check Wishlist Status Error:', error);
    res.status(500).json({ error: 'Failed to check wishlist status' });
  }
};

const moveToCart = async (req, res) => {
  try {
    const userId = req.user._id;
    const wishlistItemId = req.params.id;
    const { quantity = 1 } = req.body;
    
    const wishlistItem = await Wishlist.findOne({
      _id: wishlistItemId,
      userId
    }).populate('productId');
    
    if (!wishlistItem) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }
    
    const product = wishlistItem.productId;
    
    if (!product) {
      return res.status(404).json({ error: 'Product no longer available' });
    }
    
    if (product.stock < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock',
        available: product.stock,
        requested: quantity
      });
    }
    
    const existingCartItem = await Cart.findOne({ 
      userId, 
      productId: product._id 
    });
    
    if (existingCartItem) {
      existingCartItem.quantity += quantity;
      await existingCartItem.save();
    } else {
      await Cart.create({
        userId,
        productId: product._id,
        quantity
      });
    }
    
    await Wishlist.findByIdAndDelete(wishlistItemId);
    
    res.json({
      message: 'Product moved to cart successfully',
      product: {
        _id: product._id,
        name: product.name,
        price: product.price
      }
    });
  } catch (error) {
    console.error('Move to Cart Error:', error);
    res.status(500).json({ error: 'Failed to move product to cart' });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  removeFromWishlistByProductId,
  checkWishlistStatus,
  moveToCart
};