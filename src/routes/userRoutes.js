const express = require('express');
const { registerUser, loginUser, adminLogin, kolLogin } = require('../controllers/userController');
const router = express.Router();

// User registration
router.post('/register', registerUser);

// User login
router.post('/login', loginUser);

// Admin login
router.post('/admin', adminLogin);

router.post('/kol/login', kolLogin);

module.exports = router;