-- FreshCart MySQL Relational Schema
-- Engine: InnoDB
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS freshcart CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE freshcart;

-- --------------------------------------------------------
-- Table: customers
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL UNIQUE,
  mobile VARCHAR(32) NULL UNIQUE,
  address TEXT NULL,
  password_hash VARCHAR(255) NOT NULL,
  loyalty_tier VARCHAR(100) NOT NULL DEFAULT 'Fresh Member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_customer_id (customer_id),
  INDEX idx_customers_email (email),
  INDEX idx_customers_mobile (mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: addresses
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL,
  address_id VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL DEFAULT 'Primary Delivery',
  full_address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT '',
  state VARCHAR(100) NOT NULL DEFAULT '',
  pincode VARCHAR(20) NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_addresses_customer_id (customer_id),
  INDEX idx_addresses_address_id (address_id),
  CONSTRAINT fk_addresses_customer
    FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: products
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  supplier VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  image TEXT NULL,
  description TEXT NULL,
  sku VARCHAR(100) NULL,
  badge VARCHAR(100) NULL,
  is_organic BOOLEAN NOT NULL DEFAULT FALSE,
  is_quick_prep BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_product_id (product_id),
  INDEX idx_products_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: carts
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_carts_customer_id (customer_id),
  CONSTRAINT fk_carts_customer
    FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: cart_items
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_product (cart_id, product_id),
  INDEX idx_cart_items_cart_id (cart_id),
  INDEX idx_cart_items_product_id (product_id),
  CONSTRAINT fk_cart_items_cart
    FOREIGN KEY (cart_id) REFERENCES carts (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_cart_items_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: orders
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  mobile VARCHAR(32) NULL,
  delivery_address TEXT NOT NULL,
  delivery_time_slot VARCHAR(100) NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_code VARCHAR(64) NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Picking',
  payment_id VARCHAR(64) NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'COD',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_order_id (order_id),
  INDEX idx_orders_customer_id (customer_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: order_items
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_items_order_id (order_id),
  INDEX idx_order_items_product_id (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: coupons
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coupon_code VARCHAR(64) NOT NULL UNIQUE,
  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  minimum_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coupons_coupon_code (coupon_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: otp_records
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  customer_id VARCHAR(64) NOT NULL,
  otp_code VARCHAR(16) NULL,
  otp_hash VARCHAR(255) NOT NULL,
  otp_salt VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_otp_order_id (order_id),
  INDEX idx_otp_order_id (order_id),
  INDEX idx_otp_customer_id (customer_id),
  INDEX idx_otp_used (used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: inventory_logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL,
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  change_quantity INT NOT NULL,
  action VARCHAR(64) NOT NULL,
  notes TEXT NULL,
  operator VARCHAR(100) NOT NULL DEFAULT 'Admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inv_logs_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: payments (Supports COD, UPI, and Digital Payments)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL UNIQUE,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'COD',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  transaction_ref VARCHAR(128) NULL,
  upi_id VARCHAR(255) NULL,
  upi_merchant_name VARCHAR(255) NULL,
  razorpay_order_id VARCHAR(100) NULL,
  razorpay_payment_id VARCHAR(100) NULL,
  razorpay_signature VARCHAR(255) NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_payment_id (payment_id),
  INDEX idx_payments_order_id (order_id),
  INDEX idx_payments_customer_id (customer_id),
  INDEX idx_payments_status (payment_status),
  INDEX idx_payments_transaction_ref (transaction_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: app_settings (Delivery charges and system settings)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(64) NOT NULL UNIQUE,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
