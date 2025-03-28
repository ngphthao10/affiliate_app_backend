const mongoose = require('mongoose');

const kolAffiliateStatsSchema = new mongoose.Schema({
    kol_id: {
        type: Number,
        required: true,
        index: true
    },
    product_id: {
        type: Number,
        required: true,
        index: true
    },
    date: {
        type: Date,
        default: Date.now,
        index: true
    },
    clicks: {
        type: Number,
        default: 0
    },
    successful_purchases: {
        type: Number,
        default: 0
    },
    // Additional metrics
    views: {
        type: Number,
        default: 0
    },
    conversion_rate: {
        type: Number,
        default: 0
    },
    revenue_generated: {
        type: Number,
        default: 0
    },
    commission_earned: {
        type: Number,
        default: 0
    },
    // For time-series analysis
    hour_of_day: {
        type: Number
    },
    day_of_week: {
        type: Number
    },
    // For geo-targeting
    country: {
        type: String
    },
    city: {
        type: String
    },
    // For UTM tracking
    utm_source: {
        type: String
    },
    utm_medium: {
        type: String
    },
    utm_campaign: {
        type: String
    }
});

// Create compound indexes for efficient querying
kolAffiliateStatsSchema.index({ kol_id: 1, date: 1 });
kolAffiliateStatsSchema.index({ product_id: 1, date: 1 });
kolAffiliateStatsSchema.index({ kol_id: 1, product_id: 1, date: 1 });

module.exports = mongoose.model('KolAffiliateStats', kolAffiliateStatsSchema);