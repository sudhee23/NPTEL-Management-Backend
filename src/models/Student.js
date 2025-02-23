const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  rollNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  branch: {
    type: String,
    trim: true
  },
  year: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  courses: [
    {
      courseId: {
        type: String,
        required: true,
        trim: true
      },
      courseName: {
        type: String,
        trim: true,
        required: true
      },
      subjectMentor: {
        type: String,
        trim: true
      },
      registeredOn: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['active', 'completed', 'dropped'],
        default: 'active'
      },
      results: [
        {
          week: {
            type: String,
            required: true,
            trim: true
          },
          score: {
            type: Number,
            default: 0
          },
          submittedAt: {
            type: Date,
            default: Date.now
          }
        }
      ]
    },
  ],
}, { timestamps: true });

// Add indexes for better query performance
StudentSchema.index({ rollNumber: 1 });
StudentSchema.index({ 'courses.courseId': 1 });
StudentSchema.index({ 'courses.courseName': 1 });

// Virtual for getting active courses
StudentSchema.virtual('activeCourses').get(function() {
  return this.courses.filter(course => course.status === 'active');
});

// Method to add a new course
StudentSchema.methods.addCourse = function(courseData) {
  const existingCourse = this.courses.find(c => c.courseId === courseData.courseId);
  if (!existingCourse) {
    this.courses.push(courseData);
  }
  return this;
};

// Method to update course status
StudentSchema.methods.updateCourseStatus = function(courseId, status) {
  const course = this.courses.find(c => c.courseId === courseId);
  if (course) {
    course.status = status;
  }
  return this;
};

module.exports = mongoose.model("Student", StudentSchema);