const express = require('express');
const { registerUser, loginUser, adminLogin } = require('../controllers/userController');
const router = express.Router();

// User registration
router.post('/register', registerUser);

// User login
router.post('/login', loginUser);

// Admin login
router.post('/admin', adminLogin);

module.exports = router;