// routes/auth.js
// Handles login, logout routes

const express = require('express');
const router  = express.Router();
const authController = require('../controllers/authController');

const { redirectIfLoggedIn, isLoggedIn } = require('../middleware/auth');
const profileController = require('../controllers/profileController');

// GET /login - show login page (redirects if already logged in)
router.get('/login', redirectIfLoggedIn, authController.showLogin);

// POST /login - process login form
router.post('/login', authController.processLogin);

// GET /logout - destroy session and redirect
router.get('/logout', authController.logout);

// GET /api/auth/me - session info API
router.get('/api/auth/me', authController.getMe);

// GET /api/profile - unified profile API
router.get('/api/profile', isLoggedIn, profileController.showProfile);

module.exports = router;

