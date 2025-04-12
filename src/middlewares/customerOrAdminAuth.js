const customerAuth = require('./customerAuth');
const adminAuth = require('./adminAuth');

const customerOrAdminAuth = async (req, res, next) => {
    let called = false;

    const wrapper = async (authFunc) => {
        return new Promise((resolve) => {
            authFunc(req, res, (err) => {
                if (!err) {
                    called = true;
                    return resolve();
                }
                resolve(); // không throw, chỉ tiếp tục thử auth tiếp theo
            });
        });
    };

    await wrapper(customerAuth);
    if (called) return next(); // Nếu có quyền, chuyển đến middleware tiếp theo

    await wrapper(adminAuth);
    if (called) return next(); // Nếu có quyền admin, tiếp tục

    return res.json({ // Trả về JSON khi không có quyền truy cập
        success: false,
        message: 'Access denied: Must be admin or customer'
    });
};


module.exports = customerOrAdminAuth;
