CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone_e164 VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  pin_hash VARCHAR(255) NULL,
  pin_salt VARBINARY(32) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  blob_size BIGINT NOT NULL,
  name_enc LONGBLOB NOT NULL,  -- [salt16][iv12][cipher]
  mime_enc LONGBLOB NOT NULL,  -- [salt16][iv12][cipher]
  meta_ver TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX (user_id, created_at)
);

CREATE TABLE wa_sessions (
  session_name VARCHAR(64) PRIMARY KEY,
  creds_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE wa_keys (
  session_name VARCHAR(64) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `id` VARCHAR(128) NOT NULL,
  value_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (session_name, `type`, `id`)
);

CREATE TABLE wa_unlocks (
  user_id BIGINT PRIMARY KEY,
  is_unlocked TINYINT(1) NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE download_tokens (
  token CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  kind ENUM('single','zip_all') NOT NULL,
  file_id BIGINT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX (user_id, expires_at)
);
