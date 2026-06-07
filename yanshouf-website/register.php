<?php
/**
 * Registration Page
 * For new synagogues to sign up for the app
 */
require_once __DIR__ . '/config.php';

$error = '';
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $passwordConfirm = $_POST['password_confirm'] ?? '';
    $synagogueName = trim($_POST['synagogue_name'] ?? '');
    $contactName = trim($_POST['contact_name'] ?? '');
    $phone = trim($_POST['phone'] ?? '');

    // Validation
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'נא להזין כתובת אימייל תקינה';
    } elseif (empty($password) || strlen($password) < 6) {
        $error = 'הסיסמה חייבת להכיל לפחות 6 תווים';
    } elseif ($password !== $passwordConfirm) {
        $error = 'הסיסמאות אינן תואמות';
    } elseif (empty($synagogueName)) {
        $error = 'נא להזין את שם בית הכנסת';
    } else {
        $db = getDB();

        // Check if email exists
        $check = $db->prepare("SELECT id FROM app_users WHERE email = ?");
        $check->execute([$email]);
        if ($check->fetch()) {
            $error = 'כתובת האימייל כבר רשומה במערכת';
        } else {
            // Create user
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            $token = bin2hex(random_bytes(32));
            $trialEndsAt = date('Y-m-d H:i:s', strtotime('+1 year'));

            $stmt = $db->prepare("INSERT INTO app_users (email, password_hash, synagogue_name, contact_name, phone, status, trial_ends_at, api_token) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?)");
            $stmt->execute([$email, $passwordHash, $synagogueName, $contactName, $phone, $trialEndsAt, $token]);

            $userId = $db->lastInsertId();

            // Auto-add the gabbai (user) as a member
            $memberCode = 'M' . str_pad($userId, 6, '0', STR_PAD_LEFT) . '_001';
            $nameParts = explode(' ', $contactName, 2);
            $firstName = $nameParts[0] ?: 'גבאי';
            $lastName = $nameParts[1] ?? '';

            $stmt = $db->prepare("INSERT INTO app_members (user_id, code, first_name, last_name, phone, email, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([
                $userId,
                $memberCode,
                $firstName,
                $lastName,
                $phone,
                $email,
                'גבאי בית הכנסת (נוצר אוטומטית)'
            ]);

            $success = true;
        }
    }
}

// Get site settings
$siteName = getSetting('site_name', 'KalGabay');
?>
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>הרשמה - <?= sanitize($siteName) ?></title>
    <link rel="stylesheet" href="css/style.css?v=<?= time() ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .register-container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .register-header {
            text-align: center;
            margin-bottom: 30px;
        }
        .register-header img {
            max-width: 120px;
            margin-bottom: 15px;
        }
        .register-header h1 {
            color: #1e40af;
            margin-bottom: 10px;
        }
        .register-header p {
            color: #666;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 14px 18px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #3b82f6;
        }
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .btn-register {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.3s, box-shadow 0.3s;
        }
        .btn-register:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);
        }
        .alert {
            padding: 15px 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .alert-error {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
        }
        .alert-success {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #a7f3d0;
        }
        .success-box {
            text-align: center;
            padding: 40px 20px;
        }
        .success-box i {
            font-size: 4rem;
            color: #10b981;
            margin-bottom: 20px;
        }
        .success-box h2 {
            color: #065f46;
            margin-bottom: 15px;
        }
        .success-box p {
            color: #666;
            margin-bottom: 25px;
            line-height: 1.8;
        }
        .trial-badge {
            display: inline-block;
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: white;
            padding: 10px 25px;
            border-radius: 30px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        .back-link {
            display: block;
            text-align: center;
            margin-top: 25px;
            color: #666;
            text-decoration: none;
        }
        .back-link:hover {
            color: #1e40af;
        }
        .features-list {
            background: #f0f9ff;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
        }
        .features-list h4 {
            color: #1e40af;
            margin-bottom: 15px;
        }
        .features-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .features-list li {
            padding: 8px 0;
            color: #374151;
        }
        .features-list li i {
            color: #10b981;
            margin-left: 10px;
        }
        @media (max-width: 500px) {
            .form-row {
                grid-template-columns: 1fr;
            }
            .register-container {
                padding: 25px;
            }
        }
    </style>
</head>
<body>
    <div class="register-container">
        <?php if ($success): ?>
            <div class="success-box">
                <i class="fas fa-check-circle"></i>
                <h2>ההרשמה הושלמה בהצלחה!</h2>
                <div class="trial-badge">
                    <i class="fas fa-gift"></i> שנה חינם!
                </div>
                <p>
                    תודה שנרשמת ל-<?= sanitize($siteName) ?>!<br>
                    קיבלת שנה שלמה של שימוש חינם באפליקציה.<br><br>
                    <strong>פרטי ההתחברות נשלחו לאימייל שלך.</strong>
                </p>
                <div class="features-list">
                    <h4>מה עכשיו?</h4>
                    <ul>
                        <li><i class="fas fa-download"></i> הורד את האפליקציה לנייד או למחשב</li>
                        <li><i class="fas fa-sign-in-alt"></i> התחבר עם האימייל והסיסמה שבחרת</li>
                        <li><i class="fas fa-users"></i> התחל להוסיף מתפללים ומצוות</li>
                        <li><i class="fas fa-sync"></i> הנתונים יסתנכרנו בין כל המכשירים</li>
                    </ul>
                </div>
                <a href="index.php#downloads" class="btn-register" style="display:inline-block;text-decoration:none;">
                    <i class="fas fa-download"></i> הורד את האפליקציה
                </a>
            </div>
        <?php else: ?>
            <div class="register-header">
                <img src="images/logo.png" alt="<?= sanitize($siteName) ?>" onerror="this.style.display='none'">
                <h1>הרשמה ל-<?= sanitize($siteName) ?></h1>
                <p>צור חשבון חדש וקבל שנה חינם!</p>
            </div>

            <?php if ($error): ?>
                <div class="alert alert-error">
                    <i class="fas fa-exclamation-circle"></i> <?= $error ?>
                </div>
            <?php endif; ?>

            <form method="POST">
                <div class="form-group">
                    <label for="synagogue_name">
                        <i class="fas fa-synagogue"></i> שם בית הכנסת *
                    </label>
                    <input type="text" id="synagogue_name" name="synagogue_name" required
                           value="<?= sanitize($_POST['synagogue_name'] ?? '') ?>"
                           placeholder="לדוגמה: בית הכנסת הגדול">
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="contact_name">
                            <i class="fas fa-user"></i> שם איש קשר
                        </label>
                        <input type="text" id="contact_name" name="contact_name"
                               value="<?= sanitize($_POST['contact_name'] ?? '') ?>"
                               placeholder="השם שלך">
                    </div>
                    <div class="form-group">
                        <label for="phone">
                            <i class="fas fa-phone"></i> טלפון
                        </label>
                        <input type="tel" id="phone" name="phone"
                               value="<?= sanitize($_POST['phone'] ?? '') ?>"
                               placeholder="050-0000000">
                    </div>
                </div>

                <div class="form-group">
                    <label for="email">
                        <i class="fas fa-envelope"></i> אימייל *
                    </label>
                    <input type="email" id="email" name="email" required
                           value="<?= sanitize($_POST['email'] ?? '') ?>"
                           placeholder="your@email.com">
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="password">
                            <i class="fas fa-lock"></i> סיסמה *
                        </label>
                        <input type="password" id="password" name="password" required
                               minlength="6" placeholder="לפחות 6 תווים">
                    </div>
                    <div class="form-group">
                        <label for="password_confirm">
                            <i class="fas fa-lock"></i> אימות סיסמה *
                        </label>
                        <input type="password" id="password_confirm" name="password_confirm" required
                               minlength="6" placeholder="הזן שוב">
                    </div>
                </div>

                <div class="features-list">
                    <h4><i class="fas fa-gift"></i> מה מקבלים?</h4>
                    <ul>
                        <li><i class="fas fa-check"></i> שנה שלמה חינם</li>
                        <li><i class="fas fa-check"></i> סנכרון בין כל המכשירים</li>
                        <li><i class="fas fa-check"></i> ניהול מתפללים ומצוות</li>
                        <li><i class="fas fa-check"></i> דוחות ומעקב תשלומים</li>
                        <li><i class="fas fa-check"></i> תמיכה טכנית מלאה</li>
                    </ul>
                </div>

                <button type="submit" class="btn-register">
                    <i class="fas fa-user-plus"></i> הרשם עכשיו
                </button>
            </form>
        <?php endif; ?>

        <a href="index.php" class="back-link">
            <i class="fas fa-arrow-right"></i> חזרה לדף הבית
        </a>
    </div>
</body>
</html>
