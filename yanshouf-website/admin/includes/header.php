<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $pageTitle ?? 'פאנל ניהול' ?> - YanShouf</title>
    <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="css/admin.css">
</head>
<body>
    <div class="admin-wrapper">
        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="sidebar-header">
                <h2><i class="fas fa-cog"></i> ניהול</h2>
            </div>
            <nav class="sidebar-nav">
                <a href="index.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'index.php' ? 'active' : '' ?>">
                    <i class="fas fa-home"></i> לוח בקרה
                </a>
                <a href="settings.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'settings.php' ? 'active' : '' ?>">
                    <i class="fas fa-sliders-h"></i> הגדרות האתר
                </a>
                <a href="products.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'products.php' ? 'active' : '' ?>">
                    <i class="fas fa-box"></i> מוצרים
                </a>
                <a href="features.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'features.php' ? 'active' : '' ?>">
                    <i class="fas fa-star"></i> תכונות
                </a>
                <a href="faq.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'faq.php' ? 'active' : '' ?>">
                    <i class="fas fa-question-circle"></i> שאלות נפוצות
                </a>
                <a href="downloads.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'downloads.php' ? 'active' : '' ?>">
                    <i class="fas fa-download"></i> קבצים להורדה
                </a>
                <a href="videos.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'videos.php' ? 'active' : '' ?>">
                    <i class="fas fa-video"></i> סרטונים
                </a>
                <a href="users.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'users.php' ? 'active' : '' ?>">
                    <i class="fas fa-users"></i> משתמשים
                </a>
                <a href="email-templates.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'email-templates.php' ? 'active' : '' ?>">
                    <i class="fas fa-envelope"></i> תבניות מייל
                </a>
                <a href="privacy-policy.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'privacy-policy.php' ? 'active' : '' ?>">
                    <i class="fas fa-shield-alt"></i> מדיניות פרטיות
                </a>
                <a href="change-password.php" class="nav-item <?= basename($_SERVER['PHP_SELF']) == 'change-password.php' ? 'active' : '' ?>">
                    <i class="fas fa-key"></i> שינוי סיסמה
                </a>
                <hr>
                <a href="<?= SITE_URL ?>" target="_blank" class="nav-item">
                    <i class="fas fa-external-link-alt"></i> צפה באתר
                </a>
                <a href="logout.php" class="nav-item logout">
                    <i class="fas fa-sign-out-alt"></i> התנתק
                </a>
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
            <header class="top-bar">
                <button class="menu-toggle" onclick="toggleSidebar()">
                    <i class="fas fa-bars"></i>
                </button>
                <div class="user-info">
                    <span>שלום, <?= sanitize($_SESSION['admin_username'] ?? 'Admin') ?></span>
                </div>
            </header>
            <div class="content">
