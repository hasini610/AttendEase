/**
 * hash_passwords.js
 * Run this file ONCE to see what bcrypt hashes look like.
 * Useful for creating seed data or resetting admin password.
 * Usage: node database/hash_passwords.js
 */

const bcrypt = require('bcryptjs');

const passwords = [
    { label: 'Admin@123',    plain: 'Admin@123' },
    { label: 'Faculty@123',  plain: 'password123' },
    { label: 'Student@123',  plain: 'password123' },
];

passwords.forEach(p => {
    const hash = bcrypt.hashSync(p.plain, 10);
    console.log(`${p.label} => ${hash}`);
});
