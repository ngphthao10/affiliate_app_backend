# How to run app

Bước 1: Chạy file db/mysql-init/01-schema.sql trên MySql Workbench.

Bước 2: Thực hiện các lệnh sau:

```bash
$npm install
$npm start
```

Khi nhận được kết quả như dưới thì connect thành công

```bash
debug: Executing (default): SELECT 1+1 AS result {"service":"ecommerce-kol-backend","timestamp":"2025-03-28T14:40:46.729Z"}
info: MySQL connection established successfully. {"service":"ecommerce-kol-backend","timestamp":"2025-03-28T14:40:46.735Z"}
info: MongoDB connection established successfully {"service":"ecommerce-kol-backend","timestamp":"2025-03-28T14:40:47.581Z"}
info: Server running on port 3000 {"service":"ecommerce-kol-backend","timestamp":"2025-03-28T14:40:47.604Z"}
```

Còn phần Mongo hiện tại chưa cần, nếu lỗi thì không ảnh hưởng tới code.
