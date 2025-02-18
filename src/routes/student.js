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

// Update week scores from CSV
router.post('/updateweekscore', upload.single('file'), async (req, res) => {
  try {
    logger.bulkUpload('Starting week score update process...');
    if (!req.file) {
      logger.error('No file received in request');
      return res.status(400).json({ error: 'Please upload a CSV file' });
    }

    // Extract course ID from filename
    const filename = req.file.originalname;
    logger.bulkUpload(`Processing file: ${filename}`);

    // Remove 'ns_' prefix if it exists and extract course ID
    const cleanedFilename = filename.replace(/^ns_/, '');
    const courseMatch = cleanedFilename.match(/noc\d+[-_](ce|cs)\d+/i);
    
    if (!courseMatch) {
      logger.error('Could not extract course ID from filename:', filename);
      return res.status(400).json({ error: 'Invalid file name format' });
    }
    
    const courseId = courseMatch[0].toLowerCase().replace('_', '-');
    logger.bulkUpload(`Extracted course ID: ${courseId}`);

    // Read CSV content
    const fileContent = req.file.buffer.toString();
    const rows = fileContent.split('\n').map(row => row.split(',').map(cell => cell.trim()));
    const headers = rows[0];

    // Find week score columns
    const weekScoreColumns = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => header.toLowerCase().includes('week') && header.toLowerCase().includes('assignment'));

    logger.bulkUpload(`Found ${weekScoreColumns.length} week score columns`);

    const results = await Promise.allSettled(
      rows.slice(1) // Skip header row
        .filter(row => row.length >= headers.length) // Skip incomplete rows
        .map(async (row) => {
          try {
            const email = row[2]; // Email is in 3rd column
            const rollNumber = row[3]; // Roll number is in 4th column

            // Prepare results array from week scores
            const results = weekScoreColumns.map(({ index }) => ({
              week: headers[index],
              score: parseFloat(row[index]) || 0
            }));

            logger.bulkUpload(`Processing scores for student: ${rollNumber}`);

            // Update student document
            const student = await Student.findOneAndUpdate(
              {
                $or: [{ email }, { rollNumber }],
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
              throw new Error(`Student not found or course not enrolled: ${rollNumber}`);
            }

            logger.bulkUpload(`Updated scores for student: ${rollNumber}`);
            return student;
          } catch (error) {
            logger.error(`Error processing row for student ${row[3]}:`, error);
            throw { studentId: row[3], error: error.message };
          }
        })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected');

    logger.bulkUpload('Week score update completed');
    logger.bulkUpload(`Successful updates: ${successful}`);
    logger.bulkUpload(`Failed updates: ${failed.length}`);

    if (failed.length > 0) {
      logger.error('Failed student updates:', failed.map(f => f.reason));
    }

    res.json({
      message: `Processed ${results.length} students`,
      courseId,
      successful,
      failed: failed.length,
      errors: failed.map(f => f.reason)
    });
  } catch (error) {
    logger.error('Fatal error in week score update:', error);
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

    // Log sample student if any found
    if (unsubmittedStudents.length > 0) {
      logger.general('Sample student:', JSON.stringify(unsubmittedStudents[0]));
    }

    res.json({
      count: unsubmittedStudents.length,
      students: unsubmittedStudents,
      query: query  // Include query in response for debugging
    });
  } catch (error) {
    logger.error('Error in fetching unsubmitted students:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;