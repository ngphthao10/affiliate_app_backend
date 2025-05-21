-- CREATE DATABASE IF NOT EXISTS ecommerce_db;
-- USE ecommerce_db;

-- Users table
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  phone_num VARCHAR(20),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active','suspended','banned'),
  status_reason VARCHAR(255),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Roles table
CREATE TABLE roles (
  role_id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL,
  description VARCHAR(255)
);

-- User role table
CREATE TABLE user_role (
  role_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (role_id, user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- User address table
CREATE TABLE user_address (
  address_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  phone_num VARCHAR(20) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100),
  is_default BOOLEAN DEFAULT FALSE,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Category table
CREATE TABLE category (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  display_text VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  parent_category_id INT,
  FOREIGN KEY (parent_category_id) REFERENCES category(category_id)
);

-- Product table
CREATE TABLE product (
  product_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100) UNIQUE,
  small_image VARCHAR(255),
  out_of_stock BOOLEAN DEFAULT FALSE,
  category_id INT,
  subCategory_id INT,
  reviews_count INT DEFAULT 0,
  commission_rate INT,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES category(category_id)
);

-- Product image table
CREATE TABLE product_image (
  image_id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  image VARCHAR(255) NOT NULL,
  alt VARCHAR(255),
  description VARCHAR(255),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

-- Product inventory table
CREATE TABLE product_inventory (
  inventory_id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  size ENUM('S', 'M', 'L', 'XL', 'XXL'),
  price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

-- Cart session table
CREATE TABLE cart_session (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Cart item table
CREATE TABLE cart_item (
  cart_item_id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  inventory_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES cart_session(session_id),
  FOREIGN KEY (inventory_id) REFERENCES product_inventory(inventory_id)
);

-- Influencer tier table
CREATE TABLE influencer_tier (
  tier_id INT AUTO_INCREMENT PRIMARY KEY,
  tier_name VARCHAR(50) NOT NULL,
  min_successful_purchases INT NOT NULL,
  commission_rate DECIMAL(5, 2) NOT NULL
);

-- Influencer table
CREATE TABLE influencer (
  influencer_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  status_reason VARCHAR(255),
  tier_id INT,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (tier_id) REFERENCES influencer_tier(tier_id)
);

-- Influencer social link table
CREATE TABLE influencer_social_link (
  link_id INT AUTO_INCREMENT PRIMARY KEY,
  influencer_id INT NOT NULL,
  platform VARCHAR(50) NOT NULL,
  profile_link VARCHAR(255) NOT NULL,
  FOREIGN KEY (influencer_id) REFERENCES influencer(influencer_id)
);

-- Influencer affiliate link table
CREATE TABLE influencer_affiliate_link (
  link_id INT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  affliate_link VARCHAR(255) NOT NULL,
  influencer_id INT NOT NULL,
  product_id INT NOT NULL,
  FOREIGN KEY (influencer_id) REFERENCES influencer(influencer_id),
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

-- Order table
CREATE TABLE `order` (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(10, 2) DEFAULT 0,
  shipping_address_id INT NOT NULL,
  note TEXT,
  status ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (shipping_address_id) REFERENCES user_address(address_id)
);

-- Order item table
CREATE TABLE order_item (
  order_item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  inventory_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  link_id INT,
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES `order`(order_id),
  FOREIGN KEY (inventory_id) REFERENCES product_inventory(inventory_id),
  FOREIGN KEY (link_id) REFERENCES influencer_affiliate_link(link_id)
);

-- Payment table
CREATE TABLE payment (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('zalopay', 'momo', 'vnpay', 'cod'),
  status ENUM ('pending', 'completed', 'failed'),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES `order`(order_id)
);

-- Review table
CREATE TABLE review (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  rate INT NOT NULL CHECK (rate BETWEEN 1 AND 5),
  content varchar(50) NOT NULL DEFAULT '',
  status ENUM ('pending', 'approved', 'rejected'),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

-- -- Trigger to update product reviews_count when a review is added/deleted
-- DELIMITER $$
-- CREATE TRIGGER update_reviews_count_insert
-- AFTER INSERT ON review
-- FOR EACH ROW
-- BEGIN
--   IF NEW.status = 'approved' THEN
--     UPDATE product
--     SET reviews_count = reviews_count + 1
--     WHERE product_id = NEW.product_id;
--   END IF;
-- END$$
-- DELIMITER ;

-- DELIMITER $$
-- CREATE TRIGGER update_reviews_count_update
-- AFTER UPDATE ON review
-- FOR EACH ROW
-- BEGIN
--   IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
--     UPDATE product
--     SET reviews_count = reviews_count + 1
--     WHERE product_id = NEW.product_id;
--   ELSEIF NEW.status != 'approved' AND OLD.status = 'approved' THEN
--     UPDATE product
--     SET reviews_count = reviews_count - 1
--     WHERE product_id = NEW.product_id;
--   END IF;
-- END$$
-- DELIMITER ;

-- DELIMITER $$
-- CREATE TRIGGER update_reviews_count_delete
-- AFTER DELETE ON review
-- FOR EACH ROW
-- BEGIN
--   IF OLD.status = 'approved' THEN
--     UPDATE product
--     SET reviews_count = reviews_count - 1
--     WHERE product_id = OLD.product_id;
--   END IF;
-- END$$
-- DELIMITER ;

-- -- KOL payout table
-- CREATE TABLE kol_payout (
--   payout_id INT AUTO_INCREMENT PRIMARY KEY,
--   kol_id INT NOT NULL,
--   total_amount DECIMAL(10, 2) NOT NULL,
--   payment_status ENUM('pending', 'completed', 'failed'),
--   payout_date DATE,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (kol_id) REFERENCES influencer(influencer_id)
-- );
-- DELIMITER //
-- CREATE PROCEDURE `update_inventory_on_order`(IN orderId INT, IN new_status VARCHAR(50))
-- BEGIN
--     DECLARE done INT DEFAULT FALSE;
--     DECLARE curr_inventory_id INT;
--     DECLARE curr_quantity INT;
--     DECLARE curr_available_quantity INT;
--     DECLARE error_message VARCHAR(255);
--     DECLARE cur CURSOR FOR 
--         SELECT inventory_id, quantity 
--         FROM order_item 
--         WHERE order_id = orderId;
--     DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

--     -- Kiểm tra trạng thái hợp lệ
--     IF new_status NOT IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned') THEN
--         SIGNAL SQLSTATE '45000'
--         SET MESSAGE_TEXT = 'Invalid order status';
--     END IF;

--     IF new_status IN ('cancelled', 'returned') THEN
--         OPEN cur;
--         read_loop: LOOP
--             FETCH cur INTO curr_inventory_id, curr_quantity;
--             IF done THEN
--                 LEAVE read_loop;
--             END IF;
--             -- Tăng số lượng tồn kho
--             UPDATE product_inventory
--             SET quantity = quantity + curr_quantity
--             WHERE inventory_id = curr_inventory_id;
--         END LOOP;
--         CLOSE cur;
--     ELSE
--         OPEN cur;
--         read_loop: LOOP
--             FETCH cur INTO curr_inventory_id, curr_quantity;
--             IF done THEN
--                 LEAVE read_loop;
--             END IF;
--             -- Kiểm tra số lượng tồn kho trước khi cập nhật
--             SELECT quantity INTO curr_available_quantity
--             FROM product_inventory
--             WHERE inventory_id = curr_inventory_id;
            
--             IF curr_available_quantity < curr_quantity THEN
--                 -- Tạo thông điệp lỗi thủ công
--                 SET error_message = 'Insufficient inventory quantity for inventory_id: ';
--                 SET error_message = CONCAT(error_message, CAST(curr_inventory_id AS CHAR));
--                 SET error_message = CONCAT(error_message, '. Requested: ');
--                 SET error_message = CONCAT(error_message, CAST(curr_quantity AS CHAR));
--                 SET error_message = CONCAT(error_message, ', Available: ');
--                 SET error_message = CONCAT(error_message, CAST(curr_available_quantity AS CHAR));
                
--                 SIGNAL SQLSTATE '45000'
--                 SET MESSAGE_TEXT = error_message;
--             END IF;
            
--             -- Trừ số lượng tồn kho
--             UPDATE product_inventory
--             SET quantity = quantity - curr_quantity
--             WHERE inventory_id = curr_inventory_id;
--         END LOOP;
--         CLOSE cur;
--     END IF;

--     -- Cập nhật out_of_stock
--     UPDATE product p
--     JOIN (
--         SELECT product_id, SUM(quantity) AS total_quantity
--         FROM product_inventory
--         GROUP BY product_id
--     ) pi ON p.product_id = pi.product_id
--     SET p.out_of_stock = (pi.total_quantity = 0);
-- END//
-- DELIMITER ;
-- -- Insert default roles
INSERT INTO roles (role_name, description) VALUES 
('admin', 'Administrator with full access'),
('customer', 'Regular customer'),
('influencer', 'Influencer/KOL with affiliate marketing capabilities');

-- DELIMITER $$

-- CREATE TRIGGER update_payment_on_order_cancel_return
-- AFTER UPDATE ON `order`
-- FOR EACH ROW
-- BEGIN
--     IF NEW.status IN ('cancelled', 'returned') AND OLD.status NOT IN ('cancelled', 'returned') THEN
--         UPDATE payment
--         SET status = 'failed', modified_at = CURRENT_TIMESTAMP
--         WHERE order_id = NEW.order_id;
--     END IF;
-- END$$

-- DELIMITER ;

-- DELIMITER $$

-- CREATE TRIGGER update_cod_payment_on_delivered
-- AFTER UPDATE ON `order`
-- FOR EACH ROW
-- BEGIN
--     IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
--         UPDATE payment
--         SET status = 'completed', modified_at = CURRENT_TIMESTAMP
--         WHERE order_id = NEW.order_id AND payment_method = 'cod';
--     END IF;
-- END$$

-- DELIMITER ;