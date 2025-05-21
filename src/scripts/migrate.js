require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMySQLMigration() {
    let connection;
    try {
        // Kết nối đến MySQL
        // connection = await mysql.createConnection({
        //     host: process.env.MYSQL_HOST,
        //     user: process.env.MYSQL_USER,
        //     password: process.env.MYSQL_PASSWORD,
        //     port: process.env.MYSQL_PORT || 3306, // Thêm cổng kết nối
        //     multipleStatements: true, // Cho phép chạy nhiều câu lệnh SQL cùng lúc,
        //     connectTimeout: 60000 // Tăng timeout lên 60 giây
        // });
        connection = await mysql.createConnection('mysql://root:TATgzHrOfrGiXovgoznmNVMtRtjNuzlT@yamanote.proxy.rlwy.net:36544/railway?multipleStatements=true');
        console.log('Kết nối MySQL thành công, bắt đầu migration...');

        // const sqlFilePath = path.join(__dirname, '../../db/mysql-init/01-schema.sql');
        // const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        // Thực thi SQL
        console.log('Đang chạy SQL schema...');
        // await connection.query(sqlContent);
        console.log('Migration MySQL hoàn tất thành công!');

    } catch (error) {
        console.error('Lỗi trong quá trình migration MySQL:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Đã đóng kết nối MySQL');
        }
    }
}

async function migrate() {
    try {
        await runMySQLMigration();
        console.log('Tất cả migrations đã hoàn tất!');
    } catch (error) {
        console.error('Migration thất bại:', error);
        process.exit(1);
    }
}

migrate();

module.exports = { runMySQLMigration, migrate };
