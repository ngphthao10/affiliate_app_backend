const express = require('express');
const { registerUser, loginUser, adminLogin, kolLogin } = require('../controllers/userController');
const router = express.Router();

router.post('/register', registerUser);

router.post('/login', loginUser);

router.post('/admin', adminLogin);

router.post('/kol/login', kolLogin);

module.exports = router;