const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }

    async sendEmail(options) {
        try {
            const { to, subject, html } = options;

            const mailOptions = {
                from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
                to,
                subject,
                html
            };

            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`Email sent: ${info.messageId}`);
            return info;
        } catch (error) {
            logger.error(`Error sending email: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    async sendKolApprovalEmail(user, tierInfo) {
        const subject = 'Congratulations! Your KOL Application Has Been Approved';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                <h2 style="color: #4CAF50; text-align: center;">Application Approved!</h2>
                <p>Dear ${user.first_name || user.username},</p>
                <p>We are pleased to inform you that your application to become a Key Opinion Leader (KOL) has been <strong>approved</strong>!</p>
                <p>You have been assigned to the <strong>${tierInfo.tier_name}</strong> tier with a commission rate of <strong>${tierInfo.commission_rate}%</strong>.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #333;">What's Next?</h3>
                    <ul style="padding-left: 20px;">
                        <li>Log in to your account to create affiliate links for products</li>
                        <li>Share your affiliate links on your social media platforms</li>
                        <li>Track your performance and earnings in your KOL dashboard</li>
                    </ul>
                </div>
                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                <p>Thank you for partnering with us!</p>
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 5px;"><strong>The Team</strong></p>
            </div>
        `;

        return this.sendEmail({
            to: user.email,
            subject,
            html
        });
    }

    async sendKolRejectionEmail(user, reason) {
        const subject = 'Update on Your KOL Application';

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                <h2 style="color: #F44336; text-align: center;">Application Status Update</h2>
                <p>Dear ${user.first_name || user.username},</p>
                <p>Thank you for your interest in becoming a Key Opinion Leader (KOL) with us.</p>
                <p>After careful review, we regret to inform you that we are unable to approve your application at this time.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #333;">Reason for this decision:</h3>
                    <p style="font-style: italic;">${reason}</p>
                </div>
                <p>You are welcome to apply again in the future with updated information or after addressing the concerns mentioned above.</p>
                <p>If you have any questions or would like further clarification, please feel free to contact our support team.</p>
                <p>Thank you for your understanding.</p>
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 5px;"><strong>The Team</strong></p>
            </div>
        `;

        return this.sendEmail({
            to: user.email,
            subject,
            html
        });
    }

    async sendKolStatusUpdateEmail(user, status, reason) {
        const statusText = {
            'active': 'Activated',
            'suspended': 'Temporarily Suspended',
            'banned': 'Permanently Banned'
        };

        const statusColor = {
            'active': '#4CAF50',
            'suspended': '#FF9800',
            'banned': '#F44336'
        };

        const subject = `Your KOL Account Has Been ${statusText[status]}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
                <h2 style="color: ${statusColor[status]}; text-align: center;">Account Status Update</h2>
                <p>Dear ${user.first_name || user.username},</p>
                <p>We are writing to inform you that your KOL account status has been updated to <strong>${status}</strong>.</p>
                ${status !== 'active' ? `
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #333;">Reason for this action:</h3>
                    <p style="font-style: italic;">${reason}</p>
                </div>
                ` : ''}
                ${status === 'suspended' ? `
                <p>This is a temporary measure. Your account will be reviewed and may be reinstated after the issues have been resolved.</p>
                ` : ''}
                ${status === 'banned' ? `
                <p>This decision is final and your KOL privileges have been permanently revoked.</p>
                ` : ''}
                ${status === 'active' ? `
                <p>Your account is now fully active and you can continue to create and share affiliate links.</p>
                ` : ''}
                <p>If you have any questions or need clarification, please contact our support team.</p>
                <p style="margin-bottom: 0;">Best regards,</p>
                <p style="margin-top: 5px;"><strong>The Team</strong></p>
            </div>
        `;

        return this.sendEmail({
            to: user.email,
            subject,
            html
        });
    }
}

module.exports = new EmailService();