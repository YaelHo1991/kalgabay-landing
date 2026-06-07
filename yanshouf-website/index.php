<?php
/**
 * YanShouf Landing Page
 * Loads content from database
 */
require_once __DIR__ . '/config.php';

$db = getDB();

// Get settings
$settings = [];
$result = $db->query("SELECT setting_key, setting_value FROM site_settings");
while ($row = $result->fetch()) {
    $settings[$row['setting_key']] = $row['setting_value'];
}

// Get features
$features = $db->query("SELECT icon, title, description FROM features WHERE is_active = 1 ORDER BY sort_order ASC")->fetchAll();

// Get products
$products = $db->query("SELECT * FROM products WHERE is_active = 1 ORDER BY is_main_package DESC, sort_order ASC")->fetchAll();
$mainPackage = null;
$additionalProducts = [];
foreach ($products as $p) {
    if ($p['is_main_package']) {
        $mainPackage = $p;
    } else {
        $additionalProducts[] = $p;
    }
}

// Get FAQ
$faqs = $db->query("SELECT question, answer FROM faq WHERE is_active = 1 ORDER BY sort_order ASC")->fetchAll();

// Get downloads
$downloads = $db->query("SELECT * FROM downloads WHERE is_active = 1")->fetchAll();
$downloadLinks = [];
foreach ($downloads as $d) {
    $downloadLinks[$d['platform']] = $d;
}

// Get main video
$video = $db->query("SELECT * FROM videos WHERE is_active = 1 AND is_main = 1 LIMIT 1")->fetch();

$siteName = $settings['site_name'] ?? 'KalGabay';
$siteTagline = $settings['site_tagline'] ?? '';
$siteDescription = $settings['site_description'] ?? '';
?>
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?= sanitize($siteDescription) ?>">
    <title><?= sanitize($siteName) ?> - <?= sanitize($siteTagline) ?></title>

    <?php
    $favicon = $settings['favicon'] ?? '';
    if ($favicon && file_exists(__DIR__ . '/' . $favicon)):
        $ext = pathinfo($favicon, PATHINFO_EXTENSION);
        $mimeType = $ext === 'ico' ? 'image/x-icon' : 'image/png';
    ?>
    <link rel="icon" type="<?= $mimeType ?>" href="<?= sanitize($favicon) ?>">
    <link rel="shortcut icon" type="<?= $mimeType ?>" href="<?= sanitize($favicon) ?>">
    <?php endif; ?>

    <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="css/style.css?v=<?= time() ?>">
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar">
        <div class="container">
            <a href="#" class="logo"><?= sanitize($siteName) ?></a>
            <ul class="nav-links">
                <li><a href="#features">תכונות</a></li>
                <li><a href="#products">מוצרים</a></li>
                <li><a href="#download">הורדה</a></li>
                <li><a href="#faq">שאלות נפוצות</a></li>
                <li><a href="#contact">צור קשר</a></li>
                <li><a href="#register" class="nav-btn-register">הרשמה</a></li>
            </ul>
            <button class="mobile-menu-btn"><i class="fas fa-bars"></i></button>
        </div>
    </nav>

    <!-- Hero Section -->
    <header class="hero">
        <div class="container">
            <div class="hero-content">
                <h1><?= sanitize($siteName) ?></h1>
                <p class="tagline"><?= sanitize($siteTagline) ?></p>
                <p class="description"><?= sanitize($siteDescription) ?></p>
                <div class="hero-buttons">
                    <a href="#register" class="btn btn-primary">
                        <i class="fas fa-user-plus"></i> הרשם עכשיו - חינם לשנה!
                    </a>
                    <a href="#download" class="btn btn-secondary">
                        <i class="fas fa-download"></i> הורד את האפליקציה
                    </a>
                </div>
            </div>
            <div class="hero-image">
                <?php
                $heroImage = $settings['hero_image'] ?? 'images/app-mockup.png';
                if (file_exists(__DIR__ . '/' . $heroImage)):
                ?>
                <img src="<?= sanitize($heroImage) ?>" alt="<?= sanitize($siteName) ?>">
                <?php endif; ?>
            </div>
        </div>
    </header>

    <!-- Features Section -->
    <section id="features" class="features">
        <div class="container">
            <h2 class="section-title">למה <?= sanitize($siteName) ?>?</h2>
            <div class="features-grid">
                <?php foreach ($features as $feature): ?>
                <div class="feature-card">
                    <div class="icon">
                        <i class="fas fa-<?= sanitize($feature['icon']) ?>"></i>
                    </div>
                    <h3><?= sanitize($feature['title']) ?></h3>
                    <p><?= sanitize($feature['description']) ?></p>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <!-- Products Section -->
    <section id="products" class="products">
        <div class="container">
            <h2 class="section-title">המוצרים שלנו</h2>

            <?php if ($mainPackage): ?>
            <div class="main-package">
                <div class="package-image">
                    <?php if ($mainPackage['image']): ?>
                        <img src="<?= sanitize($mainPackage['image']) ?>" alt="<?= sanitize($mainPackage['name']) ?>">
                    <?php endif; ?>
                </div>
                <div class="package-content">
                    <h3><?= sanitize($mainPackage['name']) ?></h3>
                    <p class="package-description"><?= sanitize($mainPackage['description']) ?></p>
                    <div class="package-price"><?= $mainPackage['currency'] . number_format($mainPackage['price']) ?></div>
                    <?php if ($mainPackage['includes']): ?>
                    <ul class="package-includes">
                        <?php foreach (explode('|', $mainPackage['includes']) as $item): ?>
                            <li><?= sanitize($item) ?></li>
                        <?php endforeach; ?>
                    </ul>
                    <?php endif; ?>
                    <a href="#register" class="btn btn-primary">
                        <i class="fas fa-user-plus"></i> הירשם עכשיו
                    </a>
                </div>
            </div>
            <?php endif; ?>

            <?php if ($additionalProducts): ?>
            <h3 class="subsection-title">מוצרים נלווים</h3>
            <div class="products-grid">
                <?php foreach ($additionalProducts as $product): ?>
                <div class="product-card">
                    <?php if ($product['image']): ?>
                        <img src="<?= sanitize($product['image']) ?>" alt="<?= sanitize($product['name']) ?>">
                    <?php endif; ?>
                    <h4><?= sanitize($product['name']) ?></h4>
                    <p class="product-description"><?= sanitize($product['description']) ?></p>
                    <div class="product-price"><?= $product['currency'] . number_format($product['price']) ?></div>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </section>

    <!-- Video Section -->
    <?php if ($video): ?>
    <section id="video" class="video-section">
        <div class="container">
            <h2 class="section-title"><?= sanitize($video['title']) ?></h2>
            <?php if ($video['description']): ?>
                <p class="section-description"><?= sanitize($video['description']) ?></p>
            <?php endif; ?>
            <div class="video-container">
                <?php if ($video['video_type'] === 'youtube'): ?>
                    <iframe src="https://www.youtube.com/embed/<?= sanitize($video['video_id']) ?>?rel=0"
                            allowfullscreen></iframe>
                <?php elseif ($video['video_type'] === 'vimeo'): ?>
                    <iframe src="https://player.vimeo.com/video/<?= sanitize($video['video_id']) ?>"
                            allowfullscreen></iframe>
                <?php elseif ($video['video_type'] === 'upload'): ?>
                    <video controls style="width:100%;max-height:500px;background:#000;">
                        <source src="<?= sanitize($video['video_id']) ?>" type="video/mp4">
                        הדפדפן שלך לא תומך בנגן וידאו.
                    </video>
                <?php endif; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- Download Section -->
    <section id="download" class="download-section">
        <div class="container">
            <h2 class="section-title">הורד את האפליקציה</h2>
            <div class="download-buttons">
                <?php if (isset($downloadLinks['windows'])): ?>
                <a href="<?= sanitize($downloadLinks['windows']['file_path']) ?>" class="download-btn windows-btn">
                    <i class="fab fa-windows"></i>
                    <span>
                        הורד ל-Windows
                        <?php if ($downloadLinks['windows']['version']): ?>
                            <small>v<?= sanitize($downloadLinks['windows']['version']) ?></small>
                        <?php endif; ?>
                    </span>
                </a>
                <?php endif; ?>

                <?php if (isset($downloadLinks['android'])): ?>
                <a href="<?= sanitize($downloadLinks['android']['file_path']) ?>" class="download-btn android-btn">
                    <i class="fab fa-android"></i>
                    <span>
                        הורד ל-Android
                        <?php if ($downloadLinks['android']['version']): ?>
                            <small>v<?= sanitize($downloadLinks['android']['version']) ?></small>
                        <?php endif; ?>
                    </span>
                </a>
                <?php endif; ?>

                <?php if (empty($downloadLinks)): ?>
                <p class="coming-soon">האפליקציה תהיה זמינה בקרוב!</p>
                <?php endif; ?>
            </div>
        </div>
    </section>

    <!-- Registration Section -->
    <section id="register" class="register-section">
        <div class="container">
            <h2 class="section-title">הרשמה ל-<?= sanitize($siteName) ?></h2>
            <p class="section-description">צור חשבון חדש וקבל שנה חינם!</p>

            <div class="register-form-container">
                <div id="register-success" class="register-success-box" style="display:none;">
                    <i class="fas fa-check-circle"></i>
                    <h3>ההזמנה התקבלה בהצלחה!</h3>
                    <div class="trial-badge">
                        <i class="fas fa-gift"></i> שנה חינם!
                    </div>
                    <p>
                        תודה שהזמנת את ערכת <?= sanitize($siteName) ?>!<br>
                        הערכה תישלח לכתובת שציינת בהקדם.<br><br>
                        <strong>פרטי ההתחברות נשלחו לאימייל שלך.</strong><br>
                        <small>לאחר קבלת הערכה, הורד את האפליקציה והתחבר.</small>
                    </p>
                    <a href="#download" class="btn btn-primary">
                        <i class="fas fa-download"></i> הורד את האפליקציה
                    </a>
                </div>

                <form id="register-form" class="register-form">
                    <div class="register-features">
                        <h4><i class="fas fa-gift"></i> מה מקבלים?</h4>
                        <ul>
                            <li><i class="fas fa-check"></i> שנה שלמה חינם</li>
                            <li><i class="fas fa-check"></i> סנכרון בין כל המכשירים</li>
                            <li><i class="fas fa-check"></i> ניהול מתפללים ומצוות</li>
                            <li><i class="fas fa-check"></i> דוחות ומעקב תשלומים</li>
                        </ul>
                    </div>

                    <div class="register-fields">
                        <div class="form-group">
                            <label for="reg-synagogue"><i class="fas fa-synagogue"></i> שם בית הכנסת *</label>
                            <input type="text" id="reg-synagogue" name="synagogue_name" required placeholder="לדוגמה: בית הכנסת הגדול">
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="reg-contact"><i class="fas fa-user"></i> שם איש קשר *</label>
                                <input type="text" id="reg-contact" name="contact_name" required placeholder="השם שלך">
                            </div>
                            <div class="form-group">
                                <label for="reg-phone"><i class="fas fa-phone"></i> טלפון *</label>
                                <input type="tel" id="reg-phone" name="phone" required placeholder="050-0000000">
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="reg-email"><i class="fas fa-envelope"></i> אימייל *</label>
                            <input type="email" id="reg-email" name="email" required placeholder="your@email.com">
                            <small class="form-hint">הסיסמה תישלח לאימייל זה</small>
                        </div>

                        <h4 class="form-section-title"><i class="fas fa-truck"></i> כתובת למשלוח הערכה</h4>

                        <div class="form-group">
                            <label for="reg-address"><i class="fas fa-map-marker-alt"></i> כתובת (רחוב ומספר) *</label>
                            <input type="text" id="reg-address" name="address" required placeholder="לדוגמה: רחוב הרצל 15">
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="reg-city"><i class="fas fa-city"></i> עיר *</label>
                                <input type="text" id="reg-city" name="city" required placeholder="לדוגמה: תל אביב">
                            </div>
                            <div class="form-group">
                                <label for="reg-zipcode"><i class="fas fa-mail-bulk"></i> מיקוד</label>
                                <input type="text" id="reg-zipcode" name="zipcode" placeholder="לדוגמה: 1234567">
                            </div>
                        </div>

                        <div id="register-error" class="register-error" style="display:none;"></div>

                        <button type="submit" class="btn btn-primary btn-register-submit">
                            <i class="fas fa-shopping-cart"></i> הזמן עכשיו - חינם לשנה!
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </section>

    <!-- FAQ Section -->
    <?php if ($faqs): ?>
    <section id="faq" class="faq-section">
        <div class="container">
            <h2 class="section-title">שאלות נפוצות</h2>
            <div class="faq-list">
                <?php foreach ($faqs as $index => $faq): ?>
                <div class="faq-item">
                    <button class="faq-question" onclick="toggleFaq(this)">
                        <span><?= sanitize($faq['question']) ?></span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="faq-answer">
                        <p><?= sanitize($faq['answer']) ?></p>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- Contact Section -->
    <section id="contact" class="contact-section">
        <div class="container">
            <h2 class="section-title">צור קשר</h2>

            <!-- Contact Form -->
            <div class="contact-form-container">
                <form id="contact-form" class="contact-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="contact-name">שם מלא *</label>
                            <input type="text" id="contact-name" name="name" required>
                        </div>
                        <div class="form-group">
                            <label for="contact-email">אימייל *</label>
                            <input type="email" id="contact-email" name="email" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="contact-phone">טלפון</label>
                        <input type="tel" id="contact-phone" name="phone">
                    </div>
                    <div class="form-group">
                        <label for="contact-message">הודעה *</label>
                        <textarea id="contact-message" name="message" rows="4" required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-paper-plane"></i> שלח הודעה
                    </button>
                    <div id="form-status" style="margin-top:15px;display:none;"></div>
                </form>
            </div>

            <!-- Contact Options -->
            <div class="contact-options">
                <?php if (!empty($settings['contact_phone'])): ?>
                <a href="tel:<?= sanitize($settings['contact_phone']) ?>" class="contact-card">
                    <i class="fas fa-phone"></i>
                    <span>טלפון</span>
                </a>
                <?php endif; ?>

                <?php if (!empty($settings['contact_whatsapp'])): ?>
                <a href="https://wa.me/<?= preg_replace('/[^0-9]/', '', $settings['contact_whatsapp']) ?>" class="contact-card" target="_blank">
                    <i class="fab fa-whatsapp"></i>
                    <span>WhatsApp</span>
                </a>
                <?php endif; ?>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-logo">
                    <span class="logo-text"><?= sanitize($siteName) ?></span>
                    <p><?= sanitize($siteTagline) ?></p>
                </div>
                <div class="footer-links">
                    <a href="#features">תכונות</a>
                    <a href="#products">מוצרים</a>
                    <a href="#download">הורדה</a>
                    <a href="#contact">צור קשר</a>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; <?= date('Y') ?> <?= sanitize($siteName) ?>. כל הזכויות שמורות.</p>
            </div>
        </div>
    </footer>

    <script>
        // Mobile menu toggle
        document.querySelector('.mobile-menu-btn').addEventListener('click', function() {
            document.querySelector('.nav-links').classList.toggle('active');
        });

        // FAQ toggle
        function toggleFaq(btn) {
            const item = btn.parentElement;
            const wasActive = item.classList.contains('active');

            // Close all
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));

            // Open clicked if wasn't active
            if (!wasActive) {
                item.classList.add('active');
            }
        }

        // Smooth scroll
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href.length > 1) {
                    e.preventDefault();
                    const target = document.querySelector(href);
                    if (target) {
                        const navHeight = document.querySelector('.navbar').offsetHeight;
                        window.scrollTo({
                            top: target.offsetTop - navHeight - 20,
                            behavior: 'smooth'
                        });
                        document.querySelector('.nav-links').classList.remove('active');
                    }
                }
            });
        });

        // Handle hash on page load (for direct links like #forgot-password)
        if (window.location.hash) {
            setTimeout(() => {
                const target = document.querySelector(window.location.hash);
                if (target) {
                    const navHeight = document.querySelector('.navbar').offsetHeight;
                    window.scrollTo({
                        top: target.offsetTop - navHeight - 20,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }

        // Contact form submission
        document.getElementById('contact-form').addEventListener('submit', async function(e) {
            e.preventDefault();

            const form = this;
            const status = document.getElementById('form-status');
            const submitBtn = form.querySelector('button[type="submit"]');

            // Disable button
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שולח...';

            // Prepare form data
            const formData = new FormData(form);

            try {
                const response = await fetch('send-contact.php', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                status.style.display = 'block';
                if (result.success) {
                    status.innerHTML = '<div style="background:#d4edda;color:#155724;padding:15px;border-radius:8px;">' + result.message + '</div>';
                    form.reset();
                } else {
                    status.innerHTML = '<div style="background:#f8d7da;color:#721c24;padding:15px;border-radius:8px;">' + result.message + '</div>';
                }
            } catch (error) {
                status.style.display = 'block';
                status.innerHTML = '<div style="background:#f8d7da;color:#721c24;padding:15px;border-radius:8px;">שגיאה בשליחה. נסה שוב.</div>';
            }

            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> שלח הודעה';
        });

        // Registration form submission
        document.getElementById('register-form').addEventListener('submit', async function(e) {
            e.preventDefault();

            const form = this;
            const errorDiv = document.getElementById('register-error');
            const successDiv = document.getElementById('register-success');
            const submitBtn = form.querySelector('button[type="submit"]');

            // Get form values
            const synagogueName = form.querySelector('[name="synagogue_name"]').value.trim();
            const contactName = form.querySelector('[name="contact_name"]').value.trim();
            const phone = form.querySelector('[name="phone"]').value.trim();
            const email = form.querySelector('[name="email"]').value.trim();
            const address = form.querySelector('[name="address"]').value.trim();
            const city = form.querySelector('[name="city"]').value.trim();
            const zipcode = form.querySelector('[name="zipcode"]').value.trim();

            // Client-side validation
            errorDiv.style.display = 'none';

            if (!synagogueName) {
                errorDiv.textContent = 'נא להזין את שם בית הכנסת';
                errorDiv.style.display = 'block';
                return;
            }

            if (!contactName) {
                errorDiv.textContent = 'נא להזין שם איש קשר';
                errorDiv.style.display = 'block';
                return;
            }

            if (!phone) {
                errorDiv.textContent = 'נא להזין מספר טלפון';
                errorDiv.style.display = 'block';
                return;
            }

            if (!email) {
                errorDiv.textContent = 'נא להזין כתובת אימייל';
                errorDiv.style.display = 'block';
                return;
            }

            if (!address) {
                errorDiv.textContent = 'נא להזין כתובת למשלוח';
                errorDiv.style.display = 'block';
                return;
            }

            if (!city) {
                errorDiv.textContent = 'נא להזין עיר';
                errorDiv.style.display = 'block';
                return;
            }

            // Disable button
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> שולח הזמנה...';

            try {
                const response = await fetch('api/auth.php?action=register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        synagogue_name: synagogueName,
                        contact_name: contactName,
                        phone: phone,
                        address: address,
                        city: city,
                        zipcode: zipcode
                    })
                });

                const result = await response.json();

                if (result.success) {
                    // Show success message
                    form.style.display = 'none';
                    successDiv.style.display = 'block';
                } else {
                    errorDiv.textContent = result.error || 'שגיאה בהזמנה. נסה שוב.';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'שגיאה בהזמנה. נסה שוב.';
                errorDiv.style.display = 'block';
            }

            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> הזמן עכשיו - חינם לשנה!';
        });

    </script>
</body>
</html>
