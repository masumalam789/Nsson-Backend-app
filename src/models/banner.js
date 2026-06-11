const mongoose = require("mongoose");

const POSITIONS = ["home_top", "home_mid", "sidebar", "popup", "category"];

const bannerSchema = new mongoose.Schema(
  {
    heading: {
      type: String,
      required: [true, "Heading is required"],
      trim: true,
      maxlength: [200, "Heading cannot exceed 200 characters"],
    },
    subheading: {
      type: String,
      trim: true,
      maxlength: [400, "Subheading cannot exceed 400 characters"],
      default: "",
    },
    link: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      filename:     { type: String, default: null },
      originalName: { type: String, default: null },
      mimetype:     { type: String, default: null },
      size:         { type: Number, default: null },
      url:          { type: String, default: null },
    },
    position: {
      type: String,
      enum: {
        values: POSITIONS,
        message: `Position must be one of: ${POSITIONS.join(", ")}`,
      },
      required: [true, "Position is required"],
      default: "home_top",
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive"],
        message: 'Status must be "active" or "inactive"',
      },
      default: "active",
    },
    startDate: { type: Date, default: null },
    endDate:   { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual — is this banner currently live?
bannerSchema.virtual("isLive").get(function () {
  if (this.status !== "active") return false;
  const now = new Date();
  if (this.startDate && now < this.startDate) return false;
  if (this.endDate   && now > this.endDate)   return false;
  return true;
});

bannerSchema.index({ status: 1, position: 1 });
bannerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Banner", bannerSchema);