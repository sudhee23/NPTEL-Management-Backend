const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const Student = require('../models/Student');
const logger = require('../utils/logger');

const upload = multer({ storage: multer.memoryStorage() });

// Create new student
router.post('/', async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Bulk create students from Excel
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    logger.bulkUpload('Starting bulk upload process...');
    if (!req.file) {
      logger.error('No file received in request');
      return res.status(400).json({ error: 'Please upload an Excel file' });
    }
    
    logger.bulkUpload(`File received: ${req.file.originalname}, size: ${req.file.size} bytes`);

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    logger.bulkUpload(`Total rows in Excel: ${data.length}`);

    const results = await Promise.allSettled(
      data.map(async (row) => {
        logger.general( row['Email Id'])
        try {
          const studentData = {
            rollNumber: row['ID'],
            name: row['Name'],
            branch: row['Branch'],
            year: row['Year'],
            email: row['Email Id'] || `${row['ID'].toLowerCase()}@.ac.in`
          };

          const course = {
            courseId: row['Course Id'],
            courseName: row['Course Name'],
            subjectMentor: row['NPTEL SUBJECT MENTOR'],
            results: []
          };

          logger.bulkUpload(`Processing student: ${studentData.rollNumber}`);

          // Try to find and update existing student, or create new one
          const student = await Student.findOneAndUpdate(
            {
              $or: [
                { rollNumber: studentData.rollNumber },
                { email: studentData.email }
              ]
            },
            {
              $setOnInsert: {
                rollNumber: studentData.rollNumber,
                name: studentData.name,
                branch: studentData.branch,
                year: studentData.year,
                email: studentData.email
              },
              $push: { courses: course }
            },
            {
              new: true,
              upsert: true,
              runValidators: true
            }
          );

          logger.bulkUpload(`${student.isNew ? 'Created' : 'Updated'} student: ${student.rollNumber}`);
          return student;
        } catch (error) {
          logger.error(`Error processing row for student ${row['ID']}:`, error);
          throw { studentId: row['ID'], error: error.message };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');

    logger.bulkUpload('Bulk upload completed');
    logger.bulkUpload(`Successful updates: ${successful}`);
    logger.bulkUpload(`Failed updates: ${failed.length}`);
    
    if (failed.length > 0) {
      logger.error('Failed student updates:', failed.map(f => f.reason));
    }

    res.json({
      message: `Processed ${results.length} students`,
      successful,
      failed: failed.length,
      errors: failed.map(f => f.reason)
    });
  } catch (error) {
    logger.error('Fatal error in bulk upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get students who haven't submitted assignments
router.get('/unsubmitted', async (req, res) => {
  try {
    const { week, courseId, year, branch, facultyName } = req.query;
    
    // Validate required parameters
    if (!courseId || !week) {
      logger.error('Missing required parameters');
      return res.status(400).json({ 
        error: 'courseId and week are required parameters',
        receivedParams: { courseId, week, year, branch, facultyName }
      });
    }

    logger.general(`Fetching unsubmitted students with filters - courseId: ${courseId}, week: ${week}, year: ${year}, branch: ${branch}, faculty: ${facultyName}`);

    const query = {
      'courses.courseId': courseId.toLowerCase(),
      'courses.results': {
        $elemMatch: {
          week: week,
          score: 0
        }
      }
    };

    if (year) query.year = year;
    if (branch) query.branch = branch;
    if (facultyName) query['courses.subjectMentor'] = facultyName;

    logger.general(`Executing query: ${JSON.stringify(query)}`);

    const unsubmittedStudents = await Student.find(query)
      .select('name rollNumber email branch year courses.$')
      .lean();

    logger.general(`Found ${unsubmittedStudents.length} unsubmitted students`);

    res.json({
      count: unsubmittedStudents.length,
      students: unsubmittedStudents
    });
  } catch (error) {
    logger.error('Error in fetching unsubmitted students:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update student
router.put('/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete student
router.delete('/:id', async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete all students
router.delete('/bulk', async (req, res) => {
  try {
    logger.bulkUpload('Starting bulk delete process...');
    
    const result = await Student.deleteMany({});
    
    logger.bulkUpload(`Bulk delete completed. Deleted ${result.deletedCount} students`);
    
    res.json({
      message: 'Bulk delete successful',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Fatal error in bulk delete:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simplified standardization function that handles both formats
const standardizeWeekFormat = (weekString) => {
  if (!weekString) return weekString;
  
  // Handle both "Week 01" and "Week 1" formats
  const match = weekString.toLowerCase().match(/week\s*0*(\d+)(?:\s*assignment)?/i);
  if (match) {
    const weekNum = parseInt(match[1], 10); // Remove leading zeros
    return `Week ${weekNum} Assignment`;
  }
  return weekString;
};

// Update week scores from CSV
router.post('/updateweekscore', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('❌ No file received');
      return res.status(400).json({ error: 'Please upload a CSV file' });
    }

    const filename = req.file.originalname;
    console.log('📁 Processing file:', filename);

    // Updated course pattern matching to include additional branches
    const courseMatch = filename.match(/noc\d+[-_]?(cs|me|ce|ee|ece|ch|ge|de|mm)(\d+)/i) || // Standard format
                       filename.match(/(cs|me|ce|ee|ece|ch|ge|de|mm)(\d+)/i) ||             // Short format
                       filename.match(/(cs|me|ce|ee|ece|ch|ge|de|mm)[-_]?(\d+)/i) ||        // With separator
                       filename.match(/(\w+)[-_]?(\d+)/i);                                   // Any format

    if (!courseMatch) {
      console.log('❌ Could not extract course info from filename:', filename);
      return res.status(400).json({ 
        error: 'Could not determine course from filename. Please ensure filename contains course code and number (e.g., cs52, me67, ch45, ge23, de34, mm56)',
        filename: filename
      });
    }
    
    const branch = courseMatch[1].toLowerCase();
    const number = courseMatch[2];
    const courseId = `noc25-${branch}${number}`;
    console.log('📊 Processing for course:', courseId);

    const fileContent = req.file.buffer.toString('utf-8');
    const rows = fileContent.split('\n').map(row => 
      row.split(',').map(cell => cell.trim())
    );

    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    const headers = rows[0];
    console.log('📊 Original Headers:', headers);

    // More flexible week column detection
    const weekScoreColumns = headers
      .map((header, index) => ({ 
        header: standardizeWeekFormat(header), 
        originalHeader: header,
        index 
      }))
      .filter(({ header }) => 
        header.toLowerCase().includes('week') && 
        header.toLowerCase().includes('assignment')
      );

    console.log('Standardized week columns:', weekScoreColumns.map(c => 
      `${c.originalHeader} -> ${c.header}`
    ));

    if (weekScoreColumns.length === 0) {
      console.log('❌ No week score columns found in headers:', headers);
      return res.status(400).json({ 
        error: 'No week score columns found in CSV',
        headers: headers
      });
    }

    const results = await Promise.allSettled(
      rows.slice(1)
        .filter(row => row.length >= headers.length)
        .map(async (row) => {
          try {
            const email = row[2]?.toLowerCase();
            const rollNumber = row[3]?.toUpperCase();
            
            if (!email && !rollNumber) {
              throw new Error('Both email and roll number are missing');
            }

            // Prepare results array with standardized week format
            const results = weekScoreColumns.map(({ header, index }) => ({
              week: standardizeWeekFormat(header),
              score: parseFloat(row[index]) || 0
            }));

            console.log(`Processing: Roll Number: ${rollNumber}, Email: ${email}, Course: ${courseId}`);

            const student = await Student.findOneAndUpdate(
              {
                $or: [
                  { email: { $regex: new RegExp(email, 'i') } },
                  { rollNumber: { $regex: new RegExp(rollNumber, 'i') } }
                ],
                'courses.courseId': courseId
              },
              {
                $set: {
                  'courses.$.results': results
                }
              },
              { new: true }
            );

            if (!student) {
              throw new Error(`Student not found or not enrolled in course ${courseId}`);
            }

            console.log(`✅ Updated scores for: ${rollNumber || email} in course ${courseId}`);
            return student;

          } catch (error) {
            console.error(`❌ Error processing row:`, error.message);
            throw { studentId: row[3], error: error.message };
          }
        })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');

    console.log(`✅ Processing completed for ${courseId}. Success: ${successful}, Failed: ${failed.length}`);

    res.json({
      message: `Processed ${results.length} students for course ${courseId}`,
      courseId,
      successful,
      failed: failed.length,
      errors: failed.map(f => f.reason)
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    res.status(500).json({ 
      error: 'Fatal error in file processing',
      details: error.message
    });
  }
});

// Reset all students' course results
router.post('/reset-results', async (req, res) => {
  try {
    logger.bulkUpload('Starting course results reset process...');
    
    const result = await Student.updateMany(
      {},
      { $set: { 'courses.$[].results': [] } }
    );
    
    logger.bulkUpload(`Reset completed. Modified ${result.modifiedCount} students`);
    
    res.json({
      message: 'Course results reset successful',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Fatal error in resetting course results:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new route to reset all scores
router.post('/reset-all-scores', async (req, res) => {
  try {
    console.log('🔄 Starting reset of all student scores...');
    
    // Update all students: set empty results array for all courses
    const result = await Student.updateMany(
      {}, // Match all students
      { $set: { "courses.$[].results": [] } } // Set empty results array for all courses
    );

    console.log('✅ Reset completed:', {
      matched: result.matchedCount,
      modified: result.modifiedCount
    });

    res.json({
      message: 'Successfully reset all student scores',
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error resetting scores:', error);
    res.status(500).json({ 
      error: 'Error resetting scores',
      details: error.message 
    });
  }
});

// Update the statistics endpoint
router.get('/upload-statistics', async (req, res) => {
  try {
    console.log('\n📊 Starting Statistics Calculation...');

    // Get all students with their courses
    const allStudents = await Student.find({}).lean();
    console.log(`Total students in database: ${allStudents.length}`);

    // Initialize statistics object
    let statistics = {
      totalStudents: 0,
      totalSubmissions: 0,
      courseStats: {},
      branchStats: {},
      weekStats: {}
    };

    // Count all submissions and initialize course stats
    allStudents.forEach(student => {
      student.courses?.forEach(course => {
        const courseId = course.courseId;
        const branch = courseId.split('-')[1]?.replace(/\d+/g, '').toUpperCase();

        // Initialize course statistics if not exists
        if (!statistics.courseStats[courseId]) {
          statistics.courseStats[courseId] = {
            totalStudents: 0,
            studentsWithScores: 0,
            totalSubmissions: 0,
            branch: branch
          };
        }

        // Initialize branch statistics if not exists
        if (!statistics.branchStats[branch]) {
          statistics.branchStats[branch] = {
            totalStudents: 0,
            studentsWithScores: 0,
            totalSubmissions: 0
          };
        }

        // Count student in course and branch
        statistics.courseStats[courseId].totalStudents++;
        statistics.branchStats[branch].totalStudents++;

        // Process results if they exist
        if (course.results && course.results.length > 0) {
          statistics.courseStats[courseId].studentsWithScores++;
          statistics.branchStats[branch].studentsWithScores++;

          course.results.forEach(result => {
            const weekKey = result.week;
            
            // Initialize week statistics if not exists
            if (!statistics.weekStats[weekKey]) {
              statistics.weekStats[weekKey] = {
                totalStudents: 0,
                byBranch: {}
              };
            }

            // Initialize branch in week statistics if not exists
            if (!statistics.weekStats[weekKey].byBranch[branch]) {
              statistics.weekStats[weekKey].byBranch[branch] = {
                students: 0
              };
            }

            statistics.weekStats[weekKey].totalStudents++;
            statistics.weekStats[weekKey].byBranch[branch].students++;
            statistics.totalSubmissions++;
            statistics.courseStats[courseId].totalSubmissions++;
            statistics.branchStats[branch].totalSubmissions++;
          });
        }
      });
    });

    // Calculate total unique students
    statistics.totalStudents = allStudents.length;

    // Log detailed information for debugging
    console.log('\nDetailed Statistics:');
    console.log('Total Students:', statistics.totalStudents);
    console.log('Total Submissions:', statistics.totalSubmissions);
    console.log('\nBranch Statistics:');
    Object.entries(statistics.branchStats).forEach(([branch, stats]) => {
      console.log(`${branch}:`, {
        total: stats.totalStudents,
        withScores: stats.studentsWithScores,
        submissions: stats.totalSubmissions
      });
    });

    res.json(statistics);

  } catch (error) {
    console.error('❌ Error calculating statistics:', error);
    res.status(500).json({ error: 'Error calculating statistics', details: error.message });
  }
});

module.exports = router;