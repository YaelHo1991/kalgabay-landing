<?php
/**
 * Admin Panel - Site Settings
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$success = '';
$error = '';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $settings = [
        'site_name' => sanitize($_POST['site_name'] ?? ''),
        'site_tagline' => sanitize($_POST['site_tagline'] ?? ''),
        'site_description' => sanitize($_POST['site_description'] ?? ''),
        'contact_email' => sanitize($_POST['contact_email'] ?? ''),
        'contact_phone' => sanitize($_POST['contact_phone'] ?? ''),
        'contact_whatsapp' => sanitize($_POST['contact_whatsapp'] ?? '')
    ];

    try {
        // Handle favicon upload
        if (isset($_FILES['favicon']) && $_FILES['favicon']['error'] === UPLOAD_ERR_OK) {
            $allowed = ['image/x-icon', 'image/png', 'image/ico', 'image/vnd.microsoft.icon'];
            $fileType = $_FILES['favicon']['type'];

            // Also check extension
            $ext = strtolower(pathinfo($_FILES['favicon']['name'], PATHINFO_EXTENSION));
            $allowedExt = ['ico', 'png'];

            if (in_array($ext, $allowedExt)) {
                $targetPath = __DIR__ . '/../favicon.' . $ext;

                // Delete old favicon if exists
                foreach (['ico', 'png'] as $oldExt) {
                    $oldFile = __DIR__ . '/../favicon.' . $oldExt;
                    if (file_exists($oldFile)) {
                        unlink($oldFile);
                    }
                }

                if (move_uploaded_file($_FILES['favicon']['tmp_name'], $targetPath)) {
                    setSetting('favicon', 'favicon.' . $ext);
                } else {
                    $error = 'שגיאה בהעלאת הלוגו';
                }
            } else {
                $error = 'סוג קובץ לא נתמך. השתמש ב-ICO או PNG';
            }
        }

        // Handle hero image upload
        if (isset($_FILES['hero_image']) && $_FILES['hero_image']['error'] === UPLOAD_ERR_OK) {
            $ext = strtolower(pathinfo($_FILES['hero_image']['name'], PATHINFO_EXTENSION));
            $allowedExt = ['jpg', 'jpeg', 'png', 'webp'];

            if (in_array($ext, $allowedExt)) {
                // Create images directory if not exists
                if (!is_dir(__DIR__ . '/../images')) {
                    mkdir(__DIR__ . '/../images', 0755, true);
                }

                $targetPath = __DIR__ . '/../images/hero-image.' . $ext;

                if (move_uploaded_file($_FILES['hero_image']['tmp_name'], $targetPath)) {
                    setSetting('hero_image', 'images/hero-image.' . $ext);
                } else {
                    $error = 'שגיאה בהעלאת תמונת הראשית';
                }
            } else {
                $error = 'סוג קובץ לא נתמך. השתמש ב-JPG, PNG או WebP';
            }
        }

        foreach ($settings as $key => $value) {
            setSetting($key, $value);
        }
        if (!$error) {
            $success = 'ההגדרות נשמרו בהצלחה!';
        }
    } catch (Exception $e) {
        $error = 'שגיאה בשמירת ההגדרות';
    }
}

// Get current settings
$settings = [];
$result = $db->query("SELECT setting_key, setting_value FROM site_settings");
while ($row = $result->fetch()) {
    $settings[$row['setting_key']] = $row['setting_value'];
}

$pageTitle = "הגדרות האתר";
include 'includes/header.php';
?>

<div class="settings-page">
    <h1>הגדרות האתר</h1>

    <?php if ($success): ?>
        <div class="alert alert-success"><?= $success ?></div>
    <?php endif; ?>

    <?php if ($error): ?>
        <div class="alert alert-error"><?= $error ?></div>
    <?php endif; ?>

    <form method="POST" enctype="multipart/form-data">
        <div class="form-card">
            <h2><i class="fas fa-info-circle"></i> מידע כללי</h2>

            <div class="form-row">
                <div class="form-group">
                    <label for="site_name">שם האתר / המוצר</label>
                    <input type="text" id="site_name" name="site_name"
                           value="<?= sanitize($settings['site_name'] ?? 'KalGabay') ?>">
                </div>

                <div class="form-group">
                    <label for="site_tagline">סלוגן</label>
                    <input type="text" id="site_tagline" name="site_tagline"
                           value="<?= sanitize($settings['site_tagline'] ?? '') ?>">
                </div>
            </div>

            <div class="form-group">
                <label for="site_description">תיאור האתר</label>
                <textarea id="site_description" name="site_description" rows="3"><?= sanitize($settings['site_description'] ?? '') ?></textarea>
            </div>
        </div>

        <div class="form-card">
            <h2><i class="fas fa-image"></i> לוגו לכרטיסייה (Favicon)</h2>
            <p style="color:#666;margin-bottom:15px;">זה האייקון הקטן שמופיע בכרטיסייה של הדפדפן ליד שם האתר</p>

            <?php if (!empty($settings['favicon'])): ?>
            <div style="margin-bottom:15px;padding:15px;background:#f5f5f5;border-radius:8px;display:inline-flex;align-items:center;gap:15px;">
                <img src="../<?= sanitize($settings['favicon']) ?>" alt="Favicon" style="width:32px;height:32px;">
                <span>לוגו נוכחי: <?= sanitize($settings['favicon']) ?></span>
            </div>
            <?php endif; ?>

            <div class="form-group">
                <label for="favicon">העלה לוגו חדש (ICO או PNG, מומלץ 32x32 או 64x64 פיקסלים)</label>
                <input type="file" id="favicon" name="favicon" accept=".ico,.png">
            </div>
        </div>

        <div class="form-card">
            <h2><i class="fas fa-image"></i> תמונה ראשית (Hero Image)</h2>
            <p style="color:#666;margin-bottom:15px;">התמונה הגדולה שמופיעה בחלק העליון של דף הנחיתה</p>

            <?php if (!empty($settings['hero_image']) && file_exists(__DIR__ . '/../' . $settings['hero_image'])): ?>
            <div style="margin-bottom:15px;padding:15px;background:#f5f5f5;border-radius:8px;">
                <img src="../<?= sanitize($settings['hero_image']) ?>" alt="Hero Image" style="max-width:200px;border-radius:8px;margin-bottom:10px;display:block;">
                <span>תמונה נוכחית: <?= sanitize($settings['hero_image']) ?></span>
            </div>
            <?php endif; ?>

            <div class="form-group">
                <label for="hero_image">העלה תמונה חדשה (JPG, PNG או WebP)</label>
                <input type="file" id="hero_image" name="hero_image" accept=".jpg,.jpeg,.png,.webp">
            </div>
        </div>

        <div class="form-card">
            <h2><i class="fas fa-address-book"></i> פרטי התקשרות</h2>

            <div class="form-row">
                <div class="form-group">
                    <label for="contact_email">אימייל</label>
                    <input type="email" id="contact_email" name="contact_email"
                           value="<?= sanitize($settings['contact_email'] ?? '') ?>">
                </div>

                <div class="form-group">
                    <label for="contact_phone">טלפון</label>
                    <input type="tel" id="contact_phone" name="contact_phone"
                           value="<?= sanitize($settings['contact_phone'] ?? '') ?>">
                </div>

                <div class="form-group">
                    <label for="contact_whatsapp">WhatsApp (מספר בינלאומי)</label>
                    <input type="text" id="contact_whatsapp" name="contact_whatsapp"
                           placeholder="+972501234567"
                           value="<?= sanitize($settings['contact_whatsapp'] ?? '') ?>">
                </div>
            </div>
        </div>

        <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> שמור הגדרות
        </button>
    </form>
</div>

<?php include 'includes/footer.php'; ?>
