const mongoose = require("mongoose");

const FacultySchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  phoneNumber: { type: String, default: "Not Provided" },
  courses: [
    {
      courseId: String,
      courseName: String,
      branch: String,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Faculty", FacultySchema);