const mongoose = require('mongoose');

const kolAffiliateStatsSchema = new mongoose.Schema({
    kol_id: { type: Number, required: true, index: true },
    product_id: { type: Number, required: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    clicks: { type: Number, default: 0 },
    successful_purchases: { type: Number, default: 0 },
});

// Create compound indexes for efficient querying
kolAffiliateStatsSchema.index({ kol_id: 1, date: 1 });
kolAffiliateStatsSchema.index({ product_id: 1, date: 1 });
kolAffiliateStatsSchema.index({ kol_id: 1, product_id: 1, date: 1 });

module.exports = mongoose.model('KolAffiliateStats', kolAffiliateStatsSchema);