-- 002_users.sql
-- Core account record. Identity is phone-first (OTP); profile data lives in 003.

CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(20) UNIQUE NOT NULL,
  referral_code     VARCHAR(20) UNIQUE,
  created_at        TIMESTAMP DEFAULT NOW(),
  last_active       TIMESTAMP,
  is_verified       BOOLEAN DEFAULT false,
  is_banned         BOOLEAN DEFAULT false,
  verification_tier VARCHAR(20) DEFAULT 'none'
    CHECK (verification_tier IN ('none', 'phone', 'id_verified'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);
