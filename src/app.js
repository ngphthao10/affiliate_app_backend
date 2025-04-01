const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');
const path = require('path');

// Import routes
const indexRoutes = require('./routes/index');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const kolTierRoutes = require('./routes/kolTierRoutes');
const kolRoutes = require('./routes/kolRoutes');


// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS handling
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('dev', { stream: { write: message => logger.info(message.trim()) } })); // HTTP request logging

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api', indexRoutes);
app.use('/api/users', userRoutes);
app.use('/api/product', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/kol-tiers', kolTierRoutes);
app.use('/api/kols', kolRoutes);

app.use(errorHandler);

// 404 route
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

module.exports = app;