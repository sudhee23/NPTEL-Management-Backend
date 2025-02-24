const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const studentRoutes = require('./routes/student');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes - Update the base path to match frontend expectations
app.use('/api', studentRoutes);  // This will handle all /api/* routes

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Global error handler:', err);
  res.status(500).json({ error: err.message });
});

// 404 handler
app.use((req, res) => {
  logger.error(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.general(`Server is running on port ${PORT}`);
});