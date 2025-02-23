const updateStats = (studentsData) => {
  // First filter students by branch and year
  const filteredStudents = studentsData.filter(student => {
    const branchMatch = !filters.branch || student.branch === filters.branch;
    const yearMatch = !filters.year || student.year === filters.year;
    return branchMatch && yearMatch;
  });

  // Create maps to store course enrollments per branch
  const branchEnrollments = {};
  const branchUniqueStudents = {};
  
  // Process each student and their courses
  filteredStudents.forEach(student => {
    student.courses?.forEach(course => {
      // Extract branch from course ID (e.g., 'noc25-cs52' -> 'CS')
      const branch = course.courseId.split('-')[1]?.replace(/\d+/g, '').toUpperCase();
      
      // Initialize branch counters if they don't exist
      if (!branchEnrollments[branch]) {
        branchEnrollments[branch] = 0;
        branchUniqueStudents[branch] = new Set();
      }
      
      // Count each course enrollment
      branchEnrollments[branch]++;
      // Add student ID to track unique students
      branchUniqueStudents[branch].add(student._id.toString());
    });
  });

  // Calculate total unique students across all branches
  const allUniqueStudents = new Set();
  Object.values(branchUniqueStudents).forEach(studentSet => {
    studentSet.forEach(studentId => allUniqueStudents.add(studentId));
  });

  // Calculate weekly stats
  let weeklyStats = calculateWeeklyStats(
    filteredStudents,
    filters.courseId,
    filters.facultyName
  );

  if (filters.week) {
    weeklyStats = weeklyStats.filter(stat => stat.week === filters.week);
  }

  // Convert branch stats to include both enrollments and unique students
  const branchStats = {};
  Object.entries(branchEnrollments).forEach(([branch, enrollments]) => {
    branchStats[branch] = {
      totalStudents: enrollments, // Total course enrollments
      uniqueStudents: branchUniqueStudents[branch].size // Unique students count
    };
  });

  // Update stats with both enrollment and unique student counts
  setStats({
    totalStudents: allUniqueStudents.size,
    branchStats,
    weeklyStats,
    debug: {
      totalUnique: allUniqueStudents.size,
      branchDistribution: Object.fromEntries(
        Object.entries(branchStats).map(([branch, stats]) => [
          branch,
          `${stats.totalStudents} enrollments (${stats.uniqueStudents} unique)`
        ])
      )
    }
  });

  // Log the detailed counts for verification
  console.log('Statistics:', {
    totalUniqueStudents: allUniqueStudents.size,
    branchDistribution: Object.fromEntries(
      Object.entries(branchStats).map(([branch, stats]) => [
        branch,
        {
          enrollments: stats.totalStudents,
          uniqueStudents: stats.uniqueStudents
        }
      ])
    ),
    rawStudentCount: studentsData.length,
    filteredCount: filteredStudents.length
  });
}; 

{stats.branchStats && Object.entries(stats.branchStats).map(([branch, data], index) => (
  <MotionCard
    key={branch}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.2 + (index * 0.1) }}
  >
    <CardBody>
      <Stat>
        <StatLabel>{branch} Branch</StatLabel>
        <StatNumber>{data.totalStudents}</StatNumber>
        <StatHelpText>
          Course Enrollments
          <br />
          {data.uniqueStudents} Unique Students
        </StatHelpText>
      </Stat>
    </CardBody>
  </MotionCard>
))} 