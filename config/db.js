// config/db.js
// Reusable MySQL database connection pool using mysql2 (promise-based)
// Credentials loaded strictly from environment variables (.env)

const mysql = require('mysql2');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'attendease',
    port:               process.env.DB_PORT     || 3306,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    enableKeepAlive:    true,
    keepAliveInitialDelay: 0
});

// Promise wrapper for modern async/await syntax
const db = pool.promise();

// Connection health check on startup with clear error diagnostics
pool.getConnection((err, connection) => {
    if (err) {
        console.error('\n❌ [Database Connection Error]: Failed to connect to MySQL database.');
        console.error(`   Error Code: ${err.code}`);
        console.error(`   Message:    ${err.message}`);
        console.error('   Troubleshooting checklist:');
        console.error('   1. Ensure MySQL service is running on your system.');
        console.error('   2. Verify DB_PASSWORD and DB_USER in your .env file.');
        console.error('   3. Ensure database "attendease" exists (run database/schema.sql).\n');
    } else {
        console.log(`✅ [Database]: Successfully connected to MySQL (${process.env.DB_NAME || 'attendease'} @ ${process.env.DB_HOST || 'localhost'}).`);
        connection.release();
    }
});

module.exports = db;
