const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import routes
const indexRoutes = require('./routes/index');
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const kolTierRoutes = require('./routes/kolTierRoutes');
const kolRoutes = require('./routes/kolRoutes');
const orderRoutes = require('./routes/orderRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const cartRoutes = require('./routes/cartRoutes');
const kolPayoutRoutes = require('./routes/kolPayoutRoutes');
const reviewRoutes = require('./routes/reviewRoutes')
const commissionRoutes = require('./routes/KolRoutes/commissionRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const kolStatsRoutes = require('./routes/KolRoutes/kolStatsRoutes')
const kolReportRoutes = require('./routes/KolRoutes/kolReportRoutes')
const order1Routes = require('./routes/order1Routes');

const app = express();
app.use(cookieParser());
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('dev', { stream: { write: message => logger.info(message.trim()) } })); // HTTP request logging

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// =====================================================

// API Routes
app.use('/api', indexRoutes);
app.use('/api/users', userRoutes);
app.use('/api/product', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/kol-tiers', kolTierRoutes);
app.use('/api/kols', kolRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/kol-payouts', kolPayoutRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/track', trackingRoutes);

// for kol
app.use('/api/commission', commissionRoutes);
app.use('/api/kol-stats', kolStatsRoutes);
app.use('/api/kol-report', kolReportRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/order1', order1Routes);
app.use(errorHandler);

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});


module.exports = app;