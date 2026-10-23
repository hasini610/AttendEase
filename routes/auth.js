// routes/auth.js
// Handles login, logout routes

const express = require('express');
const router  = express.Router();
const authController = require('../controllers/authController');

const { redirectIfLoggedIn } = require('../middleware/auth');

// GET /login - show login page (redirects if already logged in)
router.get('/login', redirectIfLoggedIn, authController.showLogin);

// POST /login - process login form
router.post('/login', authController.processLogin);

// GET /logout - destroy session and redirect
router.get('/logout', authController.logout);

module.exports = router;
