const express = require('express');
const {
    listCustomers,
    getCustomer,
    updateCustomer,
    changeCustomerStatus,
    deleteCustomer
} = require('../controllers/customerController');
const adminAuth = require('../middlewares/adminAuth');
const router = express.Router();

router.get('/', adminAuth, listCustomers);
router.get('/:id', adminAuth, getCustomer);
router.put('/:id', adminAuth, updateCustomer);
router.patch('/:id/status', adminAuth, changeCustomerStatus);
router.delete('/:id', adminAuth, deleteCustomer);

module.exports = router;