const mongoose = require("mongoose");

const BlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    author: {
      type:String,
      required:true
    },
    category:{
        type:String,
        required:true
    },
    status:{
      type:String,
        enum:["Published","Draft"],
        default:"Published",
    },
    publishDate:{
        type:String,
        required:true
    },
    image:{
        type:[String],
        required:true
    },
    content:{
        type:String,
        required:true
    }
  },
  { timestamps: true },
);

module.exports = mongoose.model("Blog", BlogSchema);
