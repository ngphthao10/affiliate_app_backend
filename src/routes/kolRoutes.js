const express = require('express');
const {
    listKOLs,
    getKOLDetails,
    updateKOLStatus,
    listKOLApplications,
    getApplicationDetails,
    approveApplication,
    rejectApplication
} = require('../controllers/kolController');
const adminAuth = require('../middlewares/adminAuth');

const router = express.Router();

router.get('/list', adminAuth, listKOLs);
router.get('/:id', adminAuth, getKOLDetails);
router.put('/:id/status', adminAuth, updateKOLStatus);

router.get('/list/applications', adminAuth, listKOLApplications);
router.get('/applications/:id', adminAuth, getApplicationDetails);
router.put('/applications/:id/approve', adminAuth, approveApplication);
router.put('/applications/:id/reject', adminAuth, rejectApplication);



module.exports = router;