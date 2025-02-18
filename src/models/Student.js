const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  name: String,
  rollNumber: { type: String, unique: true, required: true },
  branch: String,
  year: String,
  email: { type: String },
  courses: [
    {
      courseId: String,
      courseName: String,
      subjectMentor: String,
      results: [],
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Student", StudentSchema);