// database/fix_passwords.js
// Updates all user passwords in the MySQL database to valid bcrypt hashes

const bcrypt = require('bcryptjs');
const db     = require('../config/db');

async function fixPasswords() {
    try {
        console.log('Connecting to database...');
        
        const adminHash = await bcrypt.hash('Admin@123', 10);
        const pass123Hash = await bcrypt.hash('password123', 10);

        console.log('Generated hashes:');
        console.log('Admin@123:', adminHash);
        console.log('password123:', pass123Hash);

        // Update admin
        const [adminResult] = await db.query(
            'UPDATE users SET password = ? WHERE role = ?',
            [adminHash, 'admin']
        );
        console.log(`Updated ${adminResult.affectedRows} admin user(s).`);

        // Update faculty and students with password123
        const [othersResult] = await db.query(
            'UPDATE users SET password = ? WHERE role IN (?, ?)',
            [pass123Hash, 'faculty', 'student']
        );
        console.log(`Updated ${othersResult.affectedRows} faculty/student user(s).`);

        // List all users to verify
        const [users] = await db.query('SELECT id, username, email, role, is_active FROM users');
        console.log('\nUsers in database:');
        console.table(users);

        console.log('\nPassword fix complete!');
        process.exit(0);
    } catch (err) {
        console.error('Error fixing passwords:', err);
        process.exit(1);
    }
}

fixPasswords();
