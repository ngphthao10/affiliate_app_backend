const express = require('express');
const { registerUser, loginUser, adminLogin, kolLogin,getUser, updateUser, changePassword,registerInfluencer,assignRole } = require('../controllers/userController');
const customerAuth = require('../middlewares/customerAuth');
const router = express.Router();

router.post('/register', registerUser);

router.post('/login', loginUser);

router.post('/admin', adminLogin);

router.post('/kol/login', kolLogin);
router.get('/me', customerAuth, getUser);
router.put('/profile', customerAuth, updateUser);
router.put('/change-password', customerAuth, changePassword);
router.post('/registerinfluencer',customerAuth,registerInfluencer)
router.post('/assignrole', assignRole);
module.exports = router;