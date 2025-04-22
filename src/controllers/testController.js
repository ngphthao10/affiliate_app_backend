const crypto = require('crypto');
const mongoose = require('mongoose')
exports.showTestPurchasePage = (req, res) => {
    const nonce = crypto.randomBytes(16).toString('base64');

    const affiliateLinkId = req.cookies.affiliate_link_id;
    const influencerId = req.cookies.influencer_id;
    const productId = req.cookies.product_id;

    res.render('test-purchase', {
        title: 'Test Purchase Page',
        hasAffiliate: !!affiliateLinkId,
        affiliateInfo: {
            linkId: affiliateLinkId,
            influencerId: influencerId,
            productId: productId
        },
        nonce: nonce
    });
};

exports.simulatePurchase = async (req, res) => {

    const affiliateLinkId = req.cookies.affiliate_link_id;
    const influencerId = req.cookies.influencer_id;
    const productId = req.cookies.product_id;

    if (!affiliateLinkId || !influencerId || !productId) {
        return res.status(400).json({
            success: false,
            message: 'No affiliate information found in cookies'
        });
    }

    try {
        const KolAffiliateStats = mongoose.model('KolAffiliateStats');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await KolAffiliateStats.updateOne(
            {
                kol_id: influencerId,
                product_id: productId,
                date: {
                    $gte: today,
                    $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            },
            { $inc: { successful_purchases: 1 } },
            { upsert: true }
        );

        return res.json({
            success: true,
            message: 'Purchase simulation successful',
            affiliateInfo: {
                linkId: affiliateLinkId,
                influencerId: influencerId,
                productId: productId
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error simulating purchase ${error.message}`,
            error: error.message
        });
    }
};

