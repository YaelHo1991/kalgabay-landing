<?php
/**
 * Admin Panel - Dashboard
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();

// Get counts
$productsCount = $db->query("SELECT COUNT(*) FROM products")->fetchColumn();
$featuresCount = $db->query("SELECT COUNT(*) FROM features")->fetchColumn();
$faqCount = $db->query("SELECT COUNT(*) FROM faq")->fetchColumn();
$downloadsCount = $db->query("SELECT COUNT(*) FROM downloads")->fetchColumn();
$usersCount = $db->query("SELECT COUNT(*) FROM registered_users")->fetchColumn();

$pageTitle = "לוח בקרה";
include 'includes/header.php';
?>

<div class="dashboard">
    <h1>ברוך הבא לפאנל הניהול</h1>
    <p class="subtitle">כאן תוכל לנהל את דף הנחיתה, מוצרים, הורדות ועוד</p>

    <div class="stats-grid">
        <a href="products.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-box"></i></div>
            <div class="stat-number"><?= $productsCount ?></div>
            <div class="stat-label">מוצרים</div>
        </a>

        <a href="features.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-star"></i></div>
            <div class="stat-number"><?= $featuresCount ?></div>
            <div class="stat-label">תכונות</div>
        </a>

        <a href="faq.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-question-circle"></i></div>
            <div class="stat-number"><?= $faqCount ?></div>
            <div class="stat-label">שאלות נפוצות</div>
        </a>

        <a href="downloads.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-download"></i></div>
            <div class="stat-number"><?= $downloadsCount ?></div>
            <div class="stat-label">קבצים להורדה</div>
        </a>

        <a href="users.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-users"></i></div>
            <div class="stat-number"><?= $usersCount ?></div>
            <div class="stat-label">משתמשים רשומים</div>
        </a>

        <a href="settings.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-cog"></i></div>
            <div class="stat-number"><i class="fas fa-arrow-left"></i></div>
            <div class="stat-label">הגדרות</div>
        </a>

        <a href="email-templates.php" class="stat-card">
            <div class="stat-icon"><i class="fas fa-envelope-open-text"></i></div>
            <div class="stat-number"><i class="fas fa-arrow-left"></i></div>
            <div class="stat-label">תבניות אימייל</div>
        </a>
    </div>

    <div class="quick-actions">
        <h2>פעולות מהירות</h2>
        <div class="actions-grid">
            <a href="products.php?action=add" class="action-btn">
                <i class="fas fa-plus"></i> הוסף מוצר
            </a>
            <a href="downloads.php?action=add" class="action-btn">
                <i class="fas fa-upload"></i> העלה קובץ
            </a>
            <a href="<?= SITE_URL ?>" target="_blank" class="action-btn">
                <i class="fas fa-external-link-alt"></i> צפה באתר
            </a>
        </div>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
