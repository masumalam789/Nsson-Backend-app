require("dotenv").config();

const app = require("./app");
const connectDB = require("./src/config/mongoose");
const dns = require("dns");

const PORT = process.env.PORT || 8080;

dns.setServers(["1.1.1.1", "8.8.8.8"]);

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log("E-commerce server started successfully");
      console.log("Database: MongoDB connected");
      console.log(`Server running on port ${PORT}`);
      console.log("Razorpay KEY_ID found:", !!process.env.RAZORPAY_KEY_ID);
      console.log("Razorpay KEY_SECRET found:", !!process.env.RAZORPAY_KEY_SECRET);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });