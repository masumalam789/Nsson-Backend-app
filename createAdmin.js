require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('./src/models/User');

    const ADMIN_EMAIL    = 'admin@gmail.in';
    const ADMIN_PASSWORD = 'Admin123!';

    // Check if already exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log('⚠️  Admin already exists!');
      console.log('   Email:', existing.email);
      console.log('   Role: ', existing.role);
      console.log('\n🔑 Login with:');
      console.log('   Email:   ', ADMIN_EMAIL);
      console.log('   Password:', ADMIN_PASSWORD);
      await mongoose.disconnect();
      return;
    }

    // Create admin
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const admin = await User.create({
      firstName: 'Super',
      lastName:  'Admin',
      email:     ADMIN_EMAIL,
      password:  hashedPassword,
      role:      'admin',
    });

    console.log('✅ Admin created successfully!');
    console.log('   ID:      ', admin._id);
    console.log('   Email:   ', ADMIN_EMAIL);
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('\n🔑 Use these to login via POST /api/auth/login');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

createAdmin();