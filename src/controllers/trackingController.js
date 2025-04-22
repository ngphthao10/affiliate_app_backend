const { influencer_affiliate_link, product, influencer } = require('../models/mysql');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

exports.trackAffiliateLink = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token || !token.includes('.')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking link'
            });
        }

        const [encodedData, receivedSignature] = token.split('.');

        const dataString = Buffer.from(encodedData, 'base64').toString();
        const [influencerId, productId, linkId, timestamp] = dataString.split('-');

        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', process.env.AFFILIATE_SECRET);
        hmac.update(dataString);
        const calculatedSignature = hmac.digest('hex');

        if (calculatedSignature !== receivedSignature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking link signature'
            });
        }

        const now = Date.now();
        const linkAge = now - parseInt(timestamp);
        const maxLinkAge = 365 * 24 * 60 * 60 * 1000;

        if (linkAge > maxLinkAge) {
            return res.status(400).json({
                success: false,
                message: 'Tracking link has expired'
            });
        }

        const affiliateLink = await influencer_affiliate_link.findOne({
            where: { link_id: linkId },
            include: [
                {
                    model: product,
                    as: 'product',
                    attributes: ['product_id']
                },
                {
                    model: influencer,
                    as: 'influencer',
                    attributes: ['influencer_id']
                }
            ]
        });

        if (!affiliateLink) {
            return res.status(404).json({
                success: false,
                message: 'Affiliate link not found'
            });
        }

        const product_id = affiliateLink.product.product_id;
        const influencer_id = affiliateLink.influencer.influencer_id;

        const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
        const cookieOptions = {
            maxAge: TWO_WEEKS,
            httpOnly: false,
            sameSite: 'lax',
            path: '/'
        };

        const currentTime = Date.now();

        let affiliateLinks = [];
        if (req.cookies.affiliate_links) {
            try {
                affiliateLinks = JSON.parse(req.cookies.affiliate_links);

                affiliateLinks = affiliateLinks.filter(link => {
                    return (currentTime - link.clickTime) <= TWO_WEEKS;
                });
            } catch (error) {
                logger.error(`Error parsing affiliate_links cookie: ${error.message}`);
                affiliateLinks = [];
            }
        }

        const existingLinkIndex = affiliateLinks.findIndex(link => link.linkId === parseInt(linkId));

        if (existingLinkIndex !== -1) {
            affiliateLinks[existingLinkIndex].clickTime = currentTime;
        } else {
            affiliateLinks.push({
                linkId: parseInt(linkId),
                productId: parseInt(product_id),
                influencerId: parseInt(influencer_id),
                clickTime: currentTime
            });
        }
        res.cookie('affiliate_links', JSON.stringify(affiliateLinks), cookieOptions);

        try {
            const KolAffiliateStats = mongoose.model('KolAffiliateStats');

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let stats = await KolAffiliateStats.findOne({
                kol_id: influencer_id,
                product_id: product_id,
                date: {
                    $gte: today,
                    $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            });

            if (stats) {
                await KolAffiliateStats.updateOne(
                    { _id: stats._id },
                    { $inc: { clicks: 1 } }
                );
            } else {
                await KolAffiliateStats.create({
                    kol_id: influencer_id,
                    product_id: product_id,
                    date: today,
                    clicks: 1,
                    successful_purchases: 0
                });
            }

            logger.info(`Tracked click for link ID: ${linkId}, influencer: ${influencer_id}, product: ${product_id}`);
        } catch (error) {
            logger.error(`Error tracking click: ${error.message}`);
        }

        const baseUrl = 'http://localhost:5000';
        const redirectUrl = `${baseUrl}/product/${product_id}`;

        return res.redirect(redirectUrl);

    } catch (error) {
        logger.error(`Error in affiliate link tracking: ${error.message}`, { stack: error.stack });

        const baseUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        return res.redirect(baseUrl);
    }
};