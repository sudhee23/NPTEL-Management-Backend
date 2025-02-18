const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Create write streams for different log files
const generalLog = fs.createWriteStream(path.join(logsDir, 'general.log'), { flags: 'a' });
const errorLog = fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });
const bulkUploadLog = fs.createWriteStream(path.join(logsDir, 'bulk-upload.log'), { flags: 'a' });

const timestamp = () => new Date().toISOString();

const logger = {
    general: (message) => {
        const logMessage = `[${timestamp()}] INFO: ${message}\n`;
        generalLog.write(logMessage);
        console.log(message);
    },
    error: (message, error) => {
        const logMessage = `[${timestamp()}] ERROR: ${message}\n${error?.stack || error}\n`;
        errorLog.write(logMessage);
        console.error(message, error);
    },
    bulkUpload: (message) => {
        const logMessage = `[${timestamp()}] BULK: ${message}\n`;
        bulkUploadLog.write(logMessage);
        console.log(message);
    }
};

module.exports = logger; 