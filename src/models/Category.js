const mongoose = require("mongoose");

// Remove the buggy `require("node:os")` line entirely

const SubtitleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    // Removed categoryId — it's embedded, you already know the parent category
    subtitles: [], // will be overwritten by .add() below
  },
  { _id: true }  // correct placement: second argument to Schema constructor
);

// Self-referencing recursion — this is the correct Mongoose pattern
SubtitleSchema.add({ subtitles: [SubtitleSchema] });

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    subtitles: [SubtitleSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", CategorySchema);