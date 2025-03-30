const multer = require("multer");
const path = require("path");

// Define physical upload path for storing files
const uploadsPath = path.join(__dirname, "../../uploads/products");

const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, uploadsPath);
    },
    filename: function (req, file, callback) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const filename = "product-" + uniqueSuffix + ext;

        // Store the relative URL path in req.savedPaths for later use
        if (!req.savedPaths) req.savedPaths = {};
        req.savedPaths[file.fieldname] = `/uploads/products/${filename}`;

        callback(null, filename);
    }
});

const upload = multer({ storage });

module.exports = upload;