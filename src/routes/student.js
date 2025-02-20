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

    // Updated regex with more flexible pattern and detailed logging
    const courseMatch = filename.match(/ns_noc25_(cs|me|ce|ee|ece)(\d+)/i);
    
    if (!courseMatch) {
      logger.error('Could not extract course ID from filename:', filename);
      return res.status(400).json({ 
        error: 'Invalid file name format. Expected format: ns_noc25_BRANCH## (where BRANCH can be cs/me/ce/ee/ece)',
        receivedFilename: filename,
        fileDetails: {
          mimetype: req.file.mimetype,
          size: req.file.size,
          originalName: req.file.originalname
        }
      });
    }
    
    const branch = courseMatch[1].toLowerCase();
    const number = courseMatch[2];
    const courseId = `noc25-${branch}${number}`;
    logger.bulkUpload(`Extracted course ID: ${courseId}, Branch: ${branch}`);

    // Read CSV content with error handling
    let fileContent;
    try {
      fileContent = req.file.buffer.toString('utf-8');
      logger.bulkUpload(`File content length: ${fileContent.length} characters`);
    } catch (error) {
      logger.error('Error reading file content:', error);
      return res.status(400).json({ error: 'Error reading file content' });
    }

    // Validate CSV content
    const rows = fileContent.split('\n').map(row => row.split(',').map(cell => cell.trim()));
    if (rows.length < 2) {
      logger.error('CSV file is empty or has no data rows');
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    const headers = rows[0];
    logger.bulkUpload(`CSV Headers: ${headers.join(', ')}`);

    // Find week score columns with more detailed logging
    const weekScoreColumns = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => header.toLowerCase().includes('week') && header.toLowerCase().includes('assignment'));

    logger.bulkUpload(`Found ${weekScoreColumns.length} week score columns: ${JSON.stringify(weekScoreColumns.map(c => c.header))}`);

    if (weekScoreColumns.length === 0) {
      logger.error('No week score columns found in CSV');
      return res.status(400).json({ 
        error: 'No week score columns found in CSV',
        headers: headers 
      });
    }

    const results = await Promise.allSettled(
      rows.slice(1) // Skip header row
        .filter(row => row.length >= headers.length) // Skip incomplete rows
        .map(async (row) => {
          try {
            const email = row[2]; // Email is in 3rd column
            const rollNumber = row[3]; // Roll number is in 4th column

            if (!email || !rollNumber) {
              throw new Error(`Missing email or roll number: ${JSON.stringify({ email, rollNumber })}`);
            }

            // Prepare results array from week scores
            const results = weekScoreColumns.map(({ header, index }) => ({
              week: header,
              score: parseFloat(row[index]) || 0
            }));

            logger.bulkUpload(`Processing scores for student: ${rollNumber}, Email: ${email}`);

            // Update student document with branch check
            const student = await Student.findOneAndUpdate(
              {
                $or: [{ email }, { rollNumber }],
                'courses.courseId': courseId,
                branch: branch.toUpperCase()
              },
              {
                $set: {
                  'courses.$.results': results
                }
              },
              { new: true }
            );

            if (!student) {
              throw new Error(`Student not found or course not enrolled: ${rollNumber} (Branch: ${branch.toUpperCase()})`);
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
      branch: branch.toUpperCase(),
      successful,
      failed: failed.length,
      errors: failed.map(f => f.reason)
    });
  } catch (error) {
    logger.error('Fatal error in week score update:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
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

module.exports = router;