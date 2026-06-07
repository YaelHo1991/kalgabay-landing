-- =============================================
-- YanShouf Database Schema
-- =============================================

-- טבלת משתמשי Admin
CREATE TABLE IF NOT EXISTS `admins` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `email` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת הגדרות האתר (תוכן דף הנחיתה)
CREATE TABLE IF NOT EXISTS `site_settings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `setting_key` VARCHAR(100) NOT NULL UNIQUE,
    `setting_value` TEXT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת מוצרים
CREATE TABLE IF NOT EXISTS `products` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `price` DECIMAL(10,2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(10) DEFAULT '₪',
    `image` VARCHAR(500),
    `is_main_package` TINYINT(1) DEFAULT 0,
    `includes` TEXT,
    `sort_order` INT DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת תכונות (Features)
CREATE TABLE IF NOT EXISTS `features` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `icon` VARCHAR(50),
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `sort_order` INT DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת שאלות נפוצות (FAQ)
CREATE TABLE IF NOT EXISTS `faq` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `question` TEXT NOT NULL,
    `answer` TEXT NOT NULL,
    `sort_order` INT DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת קבצים להורדה
CREATE TABLE IF NOT EXISTS `downloads` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(200) NOT NULL,
    `platform` ENUM('windows', 'android', 'ios', 'other') NOT NULL,
    `version` VARCHAR(50),
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` VARCHAR(50),
    `is_active` TINYINT(1) DEFAULT 1,
    `download_count` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת סרטונים
CREATE TABLE IF NOT EXISTS `videos` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `video_type` ENUM('youtube', 'vimeo', 'upload') NOT NULL,
    `video_id` VARCHAR(100),
    `file_path` VARCHAR(500),
    `is_main` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- טבלת משתמשים רשומים (מדף הנחיתה)
CREATE TABLE IF NOT EXISTS `registered_users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `synagogue_name` VARCHAR(200) NOT NULL,
    `contact_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `phone` VARCHAR(20),
    `password` VARCHAR(255) NOT NULL,
    `subscription_status` ENUM('trial', 'active', 'expired', 'cancelled') DEFAULT 'trial',
    `trial_start` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `trial_end` TIMESTAMP,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- נתונים התחלתיים
-- =============================================

-- יצירת משתמש Admin ראשון (סיסמה: admin123 - לשנות מיד!)
INSERT INTO `admins` (`username`, `password`, `email`) VALUES
('admin', '$2y$10$8K1p/a0dL1LXMIgoEDFrPOeMWkJOJjU1f5HHGpvMWzlWZwXKv.qVK', 'admin@yanshouf.com');

-- הגדרות בסיסיות
INSERT INTO `site_settings` (`setting_key`, `setting_value`) VALUES
('site_name', 'KalGabay'),
('site_tagline', 'ניהול בית הכנסת בקלות ויעילות'),
('site_description', 'מערכת חכמה לניהול מצוות, מתפללים ותשלומים בבית הכנסת'),
('contact_email', 'contact@yanshouf.com'),
('contact_phone', ''),
('contact_whatsapp', ''),
('hero_title', 'KalGabay'),
('hero_image', '');

-- תכונות התחלתיות
INSERT INTO `features` (`icon`, `title`, `description`, `sort_order`) VALUES
('qrcode', 'סריקת QR מהירה', 'סרקו כרטיסי מתפללים ומצוות בשניות', 1),
('users', 'ניהול מתפללים', 'מאגר מתפללים מסודר עם פרטי קשר', 2),
('gavel', 'מכירת מצוות', 'מערכת מכירה פומבית חכמה', 3),
('chart-line', 'סטטיסטיקות', 'מעקב אחר הכנסות ותשלומים', 4),
('whatsapp', 'תזכורות WhatsApp', 'שליחת תזכורות תשלום אוטומטיות', 5),
('cloud', 'סנכרון בענן', 'גיבוי אוטומטי וגישה מכל מקום', 6);

-- שאלות נפוצות התחלתיות
INSERT INTO `faq` (`question`, `answer`, `sort_order`) VALUES
('האם צריך חיבור לאינטרנט?', 'האפליקציה עובדת גם במצב לא מקוון. הנתונים מסתנכרנים אוטומטית כשיש חיבור.', 1),
('איך מדפיסים את המדבקות?', 'המדבקות מותאמות לכל מדפסת רגילה. פשוט הדביקו את הגיליון והדפיסו.', 2),
('האם יש תמיכה טכנית?', 'כן! אנחנו זמינים במייל ובוואטסאפ לכל שאלה.', 3),
('האם אפשר לייבא נתונים קיימים?', 'כן, ניתן לייבא רשימת מתפללים מקובץ Excel.', 4);

-- מוצר ראשי (חבילה בסיסית)
INSERT INTO `products` (`name`, `description`, `price`, `currency`, `is_main_package`, `includes`, `sort_order`) VALUES
('חבילה בסיסית', 'כל מה שצריך להתחיל לעבוד עם KalGabay', 499, '₪', 1, 'אפליקציית KalGabay|100 כרטיסים עם גלגלות|100 מעטפות פלסטיק מיוחדות|גיליון מדבקות שקופות (50 מדבקות)|הדרכה מלאה', 0);

-- מוצרים נוספים
INSERT INTO `products` (`name`, `description`, `price`, `currency`, `is_main_package`, `sort_order`) VALUES
('מעטפות נוספות', 'חבילת 50 מעטפות פלסטיק איכותיות', 79, '₪', 0, 1),
('כרטיסים נוספים', 'חבילת 50 כרטיסים עם גלגלות', 99, '₪', 0, 2),
('מדבקות שקופות', 'גיליון 100 מדבקות למדפסת', 49, '₪', 0, 3),
('תמיכה פרימיום', 'תמיכה טלפונית ומענה מהיר לשנה', 199, '₪', 0, 4);
