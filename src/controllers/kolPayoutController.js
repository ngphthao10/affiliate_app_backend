const {
    kol_payout,
    influencer,
    users,
    Sequelize,
    sequelize
} = require('../models/mysql');
const logger = require('../utils/logger');
const XLSX = require('xlsx');
const Op = Sequelize.Op;

exports.getPayouts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = 'all',
            start_date,
            end_date,
            sort_by = 'payout_date',
            sort_order = 'DESC'
        } = req.query;

        // Build where conditions
        const whereConditions = {};

        if (status !== 'all') {
            whereConditions.payment_status = status;
        }

        // Add date range if provided
        if (start_date && end_date) {
            whereConditions.payout_date = {
                [Op.between]: [start_date, end_date]
            };
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total count and stats for each status
        const statsWhereConditions = {};
        if (start_date && end_date) {
            statsWhereConditions.payout_date = {
                [Op.between]: [start_date, end_date]
            };
        }

        const [
            totalStats,
            pendingStats,
            completedStats,
            failedStats
        ] = await Promise.all([
            // Get total stats
            kol_payout.findOne({
                where: statsWhereConditions,
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'total_payouts'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount']
                ],
                raw: true
            }),
            // Get pending stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'pending'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get completed stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'completed'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            }),
            // Get failed stats
            kol_payout.findOne({
                where: {
                    ...statsWhereConditions,
                    payment_status: 'failed'
                },
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('payout_id')), 'count'],
                    [sequelize.fn('SUM', sequelize.col('total_amount')), 'amount']
                ],
                raw: true
            })
        ]);

        const statusStats = {
            total_payouts: parseInt(totalStats.total_payouts) || 0,
            total_amount: parseFloat(totalStats.total_amount) || 0,
            pending_count: parseInt(pendingStats.count) || 0,
            pending_amount: parseFloat(pendingStats.amount) || 0,
            completed_count: parseInt(completedStats.count) || 0,
            completed_amount: parseFloat(completedStats.amount) || 0,
            failed_count: parseInt(failedStats.count) || 0,
            failed_amount: parseFloat(failedStats.amount) || 0
        };

        // Build user search conditions for KOL name/email
        const userSearchConditions = {};
        if (search) {
            userSearchConditions[Op.or] = [
                { username: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } }
            ];
        }

        // Fetch payouts with relations
        const payouts = await kol_payout.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [{
                        model: users,
                        as: 'user',
                        where: search ? userSearchConditions : {},
                        attributes: ['username', 'email', 'first_name', 'last_name']
                    }]
                }
            ],
            order: [[sort_by, sort_order]],
            limit: parseInt(limit),
            offset: offset
        });

        // Get total count for pagination
        const totalCount = await kol_payout.count({
            where: whereConditions,
            include: [{
                model: influencer,
                as: 'kol',
                include: [{
                    model: users,
                    as: 'user',
                    where: search ? userSearchConditions : {}
                }]
            }]
        });

        res.status(200).json({
            success: true,
            payouts: payouts,
            stats: statusStats,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        logger.error(`Error getting KOL payouts: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch KOL payouts',
            error: error.message
        });
    }
};

exports.exportPayoutReport = async (req, res) => {
    try {
        const { start_date, end_date, status = 'all' } = req.query;

        // Validate date range
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required for export'
            });
        }

        // Build where conditions
        const whereConditions = {
            payout_date: {
                [Op.between]: [start_date, end_date]
            }
        };

        if (status !== 'all') {
            whereConditions.payment_status = status;
        }

        // Fetch all payouts for the date range
        const payouts = await kol_payout.findAll({
            where: whereConditions,
            include: [
                {
                    model: influencer,
                    as: 'kol',
                    include: [{
                        model: users,
                        as: 'user',
                        attributes: ['username', 'email', 'first_name', 'last_name']
                    }]
                }
            ],
            order: [['payout_date', 'DESC']]
        });

        // Transform data for export
        const exportData = payouts.map(payout => ({
            'Payout ID': payout.payout_id,
            'KOL Name': `${payout.kol.user.first_name} ${payout.kol.user.last_name}`,
            'Username': payout.kol.user.username,
            'Email': payout.kol.user.email,
            'Amount': payout.total_amount,
            'Status': payout.payment_status,
            'Payout Date': payout.payout_date
        }));

        // Create workbook and add data
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Add summary worksheet
        const summaryData = [
            ['KOL Payout Report'],
            [`Period: ${start_date} to ${end_date}`],
            [''],
            ['Status', 'Count', 'Total Amount'],
            ['Pending', payouts.filter(p => p.payment_status === 'pending').length,
                payouts.filter(p => p.payment_status === 'pending')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Completed', payouts.filter(p => p.payment_status === 'completed').length,
                payouts.filter(p => p.payment_status === 'completed')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Failed', payouts.filter(p => p.payment_status === 'failed').length,
                payouts.filter(p => p.payment_status === 'failed')
                    .reduce((sum, p) => sum + parseFloat(p.total_amount), 0)],
            ['Total', payouts.length,
                payouts.reduce((sum, p) => sum + parseFloat(p.total_amount), 0)]
        ];

        const ws_summary = XLSX.utils.aoa_to_sheet(summaryData);

        // Add worksheets to workbook
        XLSX.utils.book_append_sheet(wb, ws_summary, 'Summary');
        XLSX.utils.book_append_sheet(wb, ws, 'Payout Details');

        // Generate file name
        const fileName = `kol_payouts_${start_date}_to_${end_date}.xlsx`;

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        // Write to response
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.send(buffer);

    } catch (error) {
        logger.error(`Error exporting KOL payout report: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to export KOL payout report',
            error: error.message
        });
    }
};