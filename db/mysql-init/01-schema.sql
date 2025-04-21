CREATE DATABASE IF NOT EXISTS ecommerce_db;
USE ecommerce_db;

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

DELIMITER $$

-- Trigger cho INSERT
CREATE TRIGGER ensure_single_default_address_insert
BEFORE INSERT ON user_address
FOR EACH ROW
BEGIN
    IF NEW.is_default = 1 THEN
        -- Kiểm tra xem đã có địa chỉ default chưa
        IF EXISTS (SELECT 1 FROM user_address WHERE user_id = NEW.user_id AND is_default = 1) THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Default Address Already Exists';
        END IF;
    END IF;
END$$

-- Trigger cho UPDATE
CREATE TRIGGER ensure_single_default_address_update
BEFORE UPDATE ON user_address
FOR EACH ROW
BEGIN
    IF NEW.is_default = 1 AND OLD.is_default = 0 THEN
        -- Kiểm tra xem đã có địa chỉ default chưa
        IF EXISTS (SELECT 1 FROM user_address WHERE user_id = NEW.user_id AND is_default = 1 AND address_id != NEW.address_id) THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Default Address Already Exists';
        END IF;
    END IF;
END$$

DELIMITER ;

DROP TRIGGER IF EXISTS ensure_single_default_address_insert;
DROP TRIGGER IF EXISTS ensure_single_default_address_update;

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
  status ENUM ('pending', 'approved', 'rejected'),
  creation_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (product_id) REFERENCES product(product_id)
);

-- Trigger to update product reviews_count when a review is added/deleted
DELIMITER $$
CREATE TRIGGER update_reviews_count_insert
AFTER INSERT ON review
FOR EACH ROW
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE product
    SET reviews_count = reviews_count + 1
    WHERE product_id = NEW.product_id;
  END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER update_reviews_count_update
AFTER UPDATE ON review
FOR EACH ROW
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    UPDATE product
    SET reviews_count = reviews_count + 1
    WHERE product_id = NEW.product_id;
  ELSEIF NEW.status != 'approved' AND OLD.status = 'approved' THEN
    UPDATE product
    SET reviews_count = reviews_count - 1
    WHERE product_id = NEW.product_id;
  END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER update_reviews_count_delete
AFTER DELETE ON review
FOR EACH ROW
BEGIN
  IF OLD.status = 'approved' THEN
    UPDATE product
    SET reviews_count = reviews_count - 1
    WHERE product_id = OLD.product_id;
  END IF;
END$$
DELIMITER ;

-- KOL payout table
CREATE TABLE kol_payout (
  payout_id INT AUTO_INCREMENT PRIMARY KEY,
  kol_id INT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_status ENUM('pending', 'completed', 'failed'),
  payout_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  modified_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (kol_id) REFERENCES influencer(influencer_id)
);

-- Insert default roles
INSERT INTO roles (role_name, description) VALUES 
('admin', 'Administrator with full access'),
('customer', 'Regular customer'),
('influencer', 'Influencer/KOL with affiliate marketing capabilities');