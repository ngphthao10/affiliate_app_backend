require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMySQLMigration() {
    let connection;
    try {
        // Kết nối đến MySQL
        connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            multipleStatements: true // Cho phép chạy nhiều câu lệnh SQL cùng lúc
        });

        console.log('Kết nối MySQL thành công, bắt đầu migration...');

        const sqlFilePath = path.join(__dirname, '../../db/mysql-init/01-schema.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

        // Thực thi SQL
        console.log('Đang chạy SQL schema...');
        await connection.query(sqlContent);
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