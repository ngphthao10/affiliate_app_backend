const {
    influencer,
    users,
    influencer_tier,
    influencer_social_link,
    influencer_affiliate_link,
    order_item,
    order,
    Sequelize,
    sequelize
} = require('../models/mysql');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const Op = Sequelize.Op;

exports.listKOLs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = 'all', tier_id = 'all', sort_by = 'modified_at', sort_order = 'DESC' } = req.query;

        const whereConditions = {};

        if (status === 'all') {
            whereConditions.status = {
                [Op.in]: ['active', 'suspended', 'banned']
            };
        } else {
            whereConditions.status = status;
        }

        if (status !== 'all') {
            whereConditions.status = status;
        }

        if (tier_id !== 'all') {
            whereConditions.tier_id = tier_id;
        }

        const userSearchConditions = {};
        if (search) {
            userSearchConditions[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } }
            ];
        }

        const offset = (page - 1) * limit;

        const totalCount = await influencer.count({
            where: whereConditions,
            include: [{
                model: users,
                as: 'user',
                where: userSearchConditions,
                required: true
            }]
        });

        const validSortFields = ['username', 'email', 'tier', 'commission_rate', 'modified_at'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'modified_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        let order = [];
        if (sortField === 'username' || sortField === 'email') {
            order.push([{ model: users, as: 'user' }, sortField, sortDirection]);
        } else if (sortField === 'tier' || sortField === 'commission_rate') {
            order.push([{ model: influencer_tier, as: 'tier' }, sortField === 'tier' ? 'tier_name' : 'commission_rate', sortDirection]);
        } else {
            order.push([sortField, sortDirection]);
        }

        const [totalSalesResults] = await sequelize.query(`
            SELECT 
                i.influencer_id,
                COALESCE(SUM(o.total), 0) as total_sales,
                COUNT(DISTINCT ial.link_id) as total_links,
                COUNT(DISTINCT isl.link_id) as total_social_links
            FROM influencer i
            LEFT JOIN influencer_affiliate_link ial ON i.influencer_id = ial.influencer_id
            LEFT JOIN order_item oi ON ial.link_id = oi.link_id
            LEFT JOIN \`order\` o ON oi.order_id = o.order_id AND o.status IN ('delivered', 'completed')
            LEFT JOIN influencer_social_link isl ON i.influencer_id = isl.influencer_id
            GROUP BY i.influencer_id
        `);

        const salesMetrics = totalSalesResults.reduce((acc, result) => {
            acc[result.influencer_id] = result;
            return acc;
        }, {});

        const kols = await influencer.findAll({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    where: userSearchConditions,
                    attributes: ['user_id', 'username', 'email', 'first_name', 'last_name', 'phone_num', 'status']
                },
                {
                    model: influencer_tier,
                    as: 'tier',
                    attributes: ['tier_id', 'tier_name', 'commission_rate', 'min_successful_purchases']
                },
                {
                    model: influencer_social_link,
                    as: 'influencer_social_links',
                    attributes: ['platform', 'profile_link']
                }
            ],
            order,
            limit: parseInt(limit),
            offset: offset
        });

        const formattedKOLs = kols.map(kol => {
            const kolData = kol.get({ plain: true });
            const metrics = salesMetrics[kolData.influencer_id] || {
                total_sales: 0,
                total_links: 0,
                total_social_links: 0
            };

            return {
                ...kolData,
                total_sales: parseFloat(metrics.total_sales || 0),
                total_commission: parseFloat(metrics.total_sales || 0) * (kolData.tier.commission_rate / 100),
                total_affiliate_links: parseInt(metrics.total_links || 0),
                total_social_links: parseInt(metrics.total_social_links || 0)
            };
        });

        res.status(200).json({
            success: true,
            kols: formattedKOLs,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error listing KOLs: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOLs',
            error: error.message
        });
    }
};

exports.getKOLDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const kol = await influencer.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['user_id', 'username', 'email', 'first_name', 'last_name', 'phone_num', 'status']
                },
                {
                    model: influencer_tier,
                    as: 'tier',
                    attributes: ['tier_id', 'tier_name', 'commission_rate', 'min_successful_purchases']
                },
                {
                    model: influencer_social_link,
                    as: 'influencer_social_links',
                    attributes: ['platform', 'profile_link']
                }
            ]
        });

        if (!kol) {
            return res.status(404).json({
                success: false,
                message: 'KOL not found'
            });
        }

        const [metrics] = await sequelize.query(`
            SELECT 
                ial.link_id,
                ial.affliate_link,
                ial.created_at,
                o.order_id,
                o.total as order_total,
                o.creation_at as order_date
            FROM influencer i
            LEFT JOIN influencer_affiliate_link ial ON i.influencer_id = ial.influencer_id
            LEFT JOIN order_item oi ON ial.link_id = oi.link_id
            LEFT JOIN \`order\` o ON oi.order_id = o.order_id AND o.status IN ('delivered', 'completed')
            WHERE i.influencer_id = :influencerId
            ORDER BY o.creation_at DESC
            LIMIT 10
        `, {
            replacements: { influencerId: id }
        });

        let totalSales = 0;
        const recentTransactions = [];

        metrics.forEach(metric => {
            if (metric.order_total) {
                totalSales += parseFloat(metric.order_total);
                recentTransactions.push({
                    date: metric.order_date,
                    amount: parseFloat(metric.order_total),
                    commission: parseFloat(metric.order_total) * (kol.tier.commission_rate / 100)
                });
            }
        });

        const affiliateLinks = await influencer_affiliate_link.findAll({
            where: { influencer_id: id },
            attributes: ['link_id', 'affliate_link', 'created_at']
        });

        const kolData = kol.get({ plain: true });

        const enhancedKOLData = {
            ...kolData,
            performance: {
                total_sales: totalSales,
                total_commission: totalSales * (kolData.tier.commission_rate / 100),
                total_affiliate_links: affiliateLinks.length,
                total_social_links: kolData.influencer_social_links.length,
                recent_transactions: recentTransactions
            },
            affiliate_links: affiliateLinks
        };

        res.status(200).json({
            success: true,
            data: enhancedKOLData
        });

    } catch (error) {
        logger.error(`Error getting KOL details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL details',
            error: error.message
        });
    }
};

exports.updateKOLStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['active', 'suspended', 'banned'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const kol = await influencer.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'first_name', 'last_name']
                }
            ]
        });

        if (!kol) {
            return res.status(404).json({
                success: false,
                message: 'KOL not found'
            });
        }

        if (kol.status === status) {
            return res.status(400).json({
                success: false,
                message: `KOL is already ${status}`
            });
        }

        if ((status === 'suspended' || status === 'banned') && !reason) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required for suspend or ban actions'
            });
        }

        await kol.update({
            status,
            status_reason: reason || null,
            modified_at: new Date()
        });

        // Send email notification about status change
        try {
            await emailService.sendKolStatusUpdateEmail(kol.user, status, reason);
            logger.info(`Status update email sent to KOL ${kol.user.email}`);
        } catch (emailError) {
            logger.error(`Failed to send status update email: ${emailError.message}`, { stack: emailError.stack });
            // Continue with the response even if email fails
        }

        const updatedKol = await influencer.findByPk(id, {
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['username', 'email', 'first_name', 'last_name']
                }
            ]
        });

        res.status(200).json({
            success: true,
            message: `KOL has been ${status} successfully`,
            data: updatedKol,
            email_sent: true
        });

    } catch (error) {
        logger.error(`Error updating KOL status: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to update KOL status',
            error: error.message
        });
    }
};

exports.listKOLApplications = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', sort_by = 'modified_at', sort_order = 'DESC' } = req.query;

        const whereConditions = {
            status: 'pending'
        };

        const userSearchConditions = {};
        if (search) {
            userSearchConditions[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } }
            ];
        }

        const offset = (page - 1) * limit;

        const totalCount = await influencer.count({
            where: whereConditions,
            include: [{
                model: users,
                as: 'user',
                where: Object.keys(userSearchConditions).length > 0 ? userSearchConditions : undefined,
                required: true
            }]
        });

        const validSortFields = ['username', 'email', 'modified_at'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'modified_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        let order = [];
        if (sortField === 'username' || sortField === 'email') {
            order.push([{ model: users, as: 'user' }, sortField, sortDirection]);
        } else {
            order.push([sortField, sortDirection]);
        }

        const applications = await influencer.findAll({
            where: whereConditions,
            include: [
                {
                    model: users,
                    as: 'user',
                    where: Object.keys(userSearchConditions).length > 0 ? userSearchConditions : undefined,
                    attributes: ['user_id', 'username', 'email', 'first_name', 'last_name', 'phone_num', 'status']
                },
                {
                    model: influencer_social_link,
                    as: 'influencer_social_links',
                    attributes: ['link_id', 'platform', 'profile_link']
                }
            ],
            order,
            limit: parseInt(limit),
            offset: offset
        });

        const formattedApplications = applications.map(app => {
            const appData = app.get({ plain: true });

            return {
                ...appData,
                total_social_links: appData.influencer_social_links ? appData.influencer_social_links.length : 0,
                total_sales: 0,
                total_commission: 0,
                total_affiliate_links: 0
            };
        });

        res.status(200).json({
            success: true,
            applications: formattedApplications,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error listing KOL applications: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL applications',
            error: error.message
        });
    }
};

exports.getApplicationDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const application = await influencer.findOne({
            where: {
                influencer_id: id,
                status: 'pending'
            },
            include: [
                {
                    model: users,
                    as: 'user',
                    attributes: ['user_id', 'username', 'email', 'first_name', 'last_name', 'phone_num', 'status']
                },
                {
                    model: influencer_social_link,
                    as: 'influencer_social_links',
                    attributes: ['link_id', 'platform', 'profile_link']
                }
            ]
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        const applicationData = application.get({ plain: true });

        res.status(200).json({
            success: true,
            data: {
                ...applicationData,
                total_social_links: applicationData.influencer_social_links?.length || 0
            }
        });

    } catch (error) {
        logger.error(`Error getting KOL application details: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch application details',
            error: error.message
        });
    }
};

// exports.approveApplication = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { tier_id } = req.body;

//         const application = await influencer.findOne({
//             where: {
//                 influencer_id: id,
//                 status: 'pending'
//             },
//             include: [
//                 {
//                     model: users,
//                     as: 'user'
//                 }
//             ]
//         });

//         if (!application) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Pending application not found'
//             });
//         }

//         let tierIdToUse = tier_id;
//         if (!tierIdToUse) {
//             const defaultTier = await influencer_tier.findOne({
//                 order: [['min_successful_purchases', 'ASC']],
//                 limit: 1
//             });

//             if (defaultTier) {
//                 tierIdToUse = defaultTier.tier_id;
//             } else {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'No tier available and none specified'
//                 });
//             }
//         }

//         const tierInfo = await influencer_tier.findByPk(tierIdToUse);
//         if (!tierInfo) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Specified tier not found'
//             });
//         }

//         await application.update({
//             status: 'active',
//             tier_id: tierIdToUse,
//             status_reason: '',
//             modified_at: new Date()
//         });

//         try {
//             await emailService.sendKolApprovalEmail(application.user, tierInfo);
//             logger.info(`Approval email sent to KOL ${application.user.email}`);
//         } catch (emailError) {
//             logger.error(`Failed to send approval email: ${emailError.message}`, { stack: emailError.stack });
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Application approved successfully',
//             data: {
//                 influencer_id: application.influencer_id,
//                 user: {
//                     username: application.user.username,
//                     email: application.user.email
//                 },
//                 status: 'active',
//                 tier_id: tierIdToUse
//             },
//             email_sent: true
//         });

//     } catch (error) {
//         logger.error(`Error approving KOL application: ${error.message}`, { stack: error.stack });
//         res.status(500).json({
//             success: false,
//             message: 'Failed to approve application',
//             error: error.message
//         });
//     }
// };

exports.approveApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { tier_id } = req.body;

        const transaction = await sequelize.transaction();

        try {
            const application = await influencer.findOne({
                where: {
                    influencer_id: id,
                    status: 'pending'
                },
                include: [
                    {
                        model: users,
                        as: 'user'
                    }
                ],
                transaction
            });

            if (!application) {
                await transaction.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Pending application not found'
                });
            }

            let tierIdToUse = tier_id;
            if (!tierIdToUse) {
                const defaultTier = await influencer_tier.findOne({
                    order: [['min_successful_purchases', 'ASC']],
                    limit: 1,
                    transaction
                });

                if (defaultTier) {
                    tierIdToUse = defaultTier.tier_id;
                } else {
                    await transaction.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'No tier available and none specified'
                    });
                }
            }

            const tierInfo = await influencer_tier.findByPk(tierIdToUse, { transaction });
            if (!tierInfo) {
                await transaction.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Specified tier not found'
                });
            }

            await application.update({
                status: 'active',
                tier_id: tierIdToUse,
                status_reason: '',
                modified_at: new Date()
            }, { transaction });

            await sequelize.models.user_role.create({
                user_id: application.user_id,
                role_id: 3
            }, { transaction });

            await transaction.commit();

            try {
                await emailService.sendKolApprovalEmail(application.user, tierInfo);
                logger.info(`Approval email sent to KOL ${application.user.email}`);
            } catch (emailError) {
                logger.error(`Failed to send approval email: ${emailError.message}`, { stack: emailError.stack });
            }

            res.status(200).json({
                success: true,
                message: 'Application approved successfully and influencer role assigned',
                data: {
                    influencer_id: application.influencer_id,
                    user: {
                        username: application.user.username,
                        email: application.user.email
                    },
                    status: 'active',
                    tier_id: tierIdToUse
                },
                email_sent: true
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        logger.error(`Error approving KOL application: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to approve application',
            error: error.message
        });
    }
};

exports.rejectApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const application = await influencer.findOne({
            where: {
                influencer_id: id,
                status: 'pending'
            },
            include: [
                {
                    model: users,
                    as: 'user'
                }
            ]
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Pending application not found'
            });
        }

        await application.update({
            status: 'rejected',
            status_reason: reason.trim(),
            modified_at: new Date()
        });

        // Send rejection email notification
        try {
            await emailService.sendKolRejectionEmail(application.user, reason.trim());
            logger.info(`Rejection email sent to applicant ${application.user.email}`);
        } catch (emailError) {
            logger.error(`Failed to send rejection email: ${emailError.message}`, { stack: emailError.stack });
            // Continue with the response even if email fails
        }

        res.status(200).json({
            success: true,
            message: 'Application rejected successfully',
            email_sent: true
        });

    } catch (error) {
        logger.error(`Error rejecting KOL application: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to reject application',
            error: error.message
        });
    }
};