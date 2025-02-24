const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const studentRoutes = require('./routes/student');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3001',  // Local development
    'https://nptel-management.vercel.app'  // Your Vercel frontend domain
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Mount routes - Change this line to match your frontend expectations
app.use('/api/students', studentRoutes);  // Changed from '/api' to '/api/students'

// Add a test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Global error handler:', err);
  res.status(500).json({ error: err.message });
});

// 404 handler with detailed logging
app.use((req, res) => {
  logger.error(`404 - Route not found: ${req.method} ${req.url}`);
  logger.error('Available routes:', app._router.stack
    .filter(r => r.route)
    .map(r => ({
      path: r.route?.path,
      methods: r.route ? Object.keys(r.route.methods) : []
    }))
  );
  res.status(404).json({ 
    error: 'Route not found',
    requestedPath: req.url,
    method: req.method
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.general(`Server is running on port ${PORT}`);
});