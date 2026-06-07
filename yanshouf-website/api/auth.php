<?php
/**
 * Authentication API
 * Endpoints: login, register, logout, refresh-token
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'refresh':
        handleRefreshToken();
        break;
    case 'me':
        handleGetMe();
        break;
    case 'forgot-password':
        handleForgotPassword();
        break;
    default:
        jsonError('Unknown action', 404);
}

/**
 * Login with email and password
 */
function handleLogin() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Method not allowed', 405);
    }

    $input = getJsonInput();
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($email) || empty($password)) {
        jsonError('Email and password are required');
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        logApiRequest(null, 'auth/login', 'POST', ['email' => $email], 401);
        jsonError('Invalid email or password', 401);
    }

    if ($user['status'] === 'suspended') {
        jsonError('Account is suspended. Please contact support.', 403);
    }

    // Generate new API token
    $token = generateApiToken();
    $stmt = $db->prepare("UPDATE app_users SET api_token = ?, last_login_at = NOW() WHERE id = ?");
    $stmt->execute([$token, $user['id']]);

    logApiRequest($user['id'], 'auth/login', 'POST', ['email' => $email], 200);

    jsonResponse([
        'success' => true,
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'synagogue_name' => $user['synagogue_name'],
            'contact_name' => $user['contact_name'],
            'phone' => $user['phone'],
            'status' => $user['status'],
            'trial_ends_at' => $user['trial_ends_at'],
            'subscription_expires_at' => $user['subscription_expires_at']
        ]
    ]);
}

/**
 * Generate a random readable password
 */
function generateRandomPassword($length = 8) {
    $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $password = '';
    for ($i = 0; $i < $length; $i++) {
        $password .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $password;
}

/**
 * Send welcome email to new user with password
 */
function sendWelcomeEmail($email, $contactName, $synagogueName, $password) {
    $siteName = getSetting('site_name', 'קלגבאי');
    $adminEmail = getSetting('admin_email', 'info@yanshouf.com');

    $subject = "ברוכים הבאים ל-{$siteName} - פרטי ההתחברות שלך";

    $message = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <link href='https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap' rel='stylesheet'>
    </head>
    <body style='margin: 0; padding: 0; font-family: Heebo, Tahoma, sans-serif;'>
    <div dir='rtl' style='font-family: Heebo, Tahoma, sans-serif; max-width: 600px; margin: 0 auto;'>
        <div style='background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;'>
            <h1 style='color: white; margin: 0; font-family: Heebo, Tahoma, sans-serif;'>{$siteName}</h1>
        </div>

        <div style='padding: 30px; background: #f8f9fa;'>
            <h2 style='color: #1e40af; font-family: Heebo, Tahoma, sans-serif;'>שלום {$contactName},</h2>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>תודה שהזמנת את ערכת {$siteName} עבור <strong>{$synagogueName}</strong>!</p>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>ההזמנה שלך התקבלה בהצלחה וערכת הקלגבאי תישלח לכתובת שציינת בהקדם.</p>

            <div style='background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #1e40af;'>
                <h3 style='color: #1e40af; margin-top: 0; font-family: Heebo, Tahoma, sans-serif;'>פרטי ההתחברות שלך:</h3>
                <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>אימייל:</strong> <a href='mailto:{$email}' style='color: #3b82f6;'>{$email}</a></p>
                <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>סיסמה:</strong> <span style='background: #e5e7eb; padding: 5px 10px; border-radius: 5px; font-family: monospace;'>{$password}</span></p>
            </div>

            <p style='color: #666; font-family: Heebo, Tahoma, sans-serif;'>מומלץ לשמור את הסיסמה במקום בטוח או לשנות אותה לאחר ההתחברות הראשונה.</p>

            <div style='background: #fef3c7; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #f59e0b;'>
                <p style='margin: 0; color: #92400e; font-family: Heebo, Tahoma, sans-serif;'><strong>שנה חינם!</strong> נהנה משנה שלמה של שימוש חינמי באפליקציה.</p>
            </div>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>לאחר קבלת הערכה, הורד את האפליקציה והתחבר עם הפרטים שלעיל.</p>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>בברכה,<br>צוות {$siteName}</p>
        </div>

        <div style='background: #1e40af; padding: 20px; text-align: center;'>
            <p style='color: white; margin: 0; font-size: 14px; font-family: Heebo, Tahoma, sans-serif;'>לשאלות ותמיכה: <a href='mailto:{$adminEmail}' style='color: white; text-decoration: underline;'>{$adminEmail}</a></p>
        </div>
    </div>
    </body>
    </html>
    ";

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$siteName} <noreply@yanshouf.com>\r\n";

    return mail($email, "=?UTF-8?B?" . base64_encode($subject) . "?=", $message, $headers);
}

/**
 * Send order notification to admin
 */
function sendOrderNotificationEmail($orderData) {
    $siteName = getSetting('site_name', 'קלגבאי');
    $adminEmail = getSetting('admin_email', 'info@yanshouf.com');

    $subject = "הזמנה חדשה - {$orderData['synagogue_name']}";

    $message = "
    <div dir='rtl' style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
        <div style='background: #10b981; padding: 20px; text-align: center;'>
            <h1 style='color: white; margin: 0;'>הזמנה חדשה!</h1>
        </div>

        <div style='padding: 30px; background: #f8f9fa;'>
            <h2 style='color: #1e40af;'>פרטי ההזמנה:</h2>

            <table style='width: 100%; border-collapse: collapse;'>
                <tr style='background: #e5e7eb;'>
                    <td style='padding: 10px; font-weight: bold;'>בית הכנסת:</td>
                    <td style='padding: 10px;'>{$orderData['synagogue_name']}</td>
                </tr>
                <tr>
                    <td style='padding: 10px; font-weight: bold;'>איש קשר:</td>
                    <td style='padding: 10px;'>{$orderData['contact_name']}</td>
                </tr>
                <tr style='background: #e5e7eb;'>
                    <td style='padding: 10px; font-weight: bold;'>טלפון:</td>
                    <td style='padding: 10px;'>{$orderData['phone']}</td>
                </tr>
                <tr>
                    <td style='padding: 10px; font-weight: bold;'>אימייל:</td>
                    <td style='padding: 10px;'>{$orderData['email']}</td>
                </tr>
            </table>

            <h3 style='color: #1e40af; margin-top: 30px;'>כתובת למשלוח:</h3>
            <div style='background: white; padding: 15px; border-radius: 10px; border: 1px solid #ddd;'>
                <p style='margin: 5px 0;'><strong>רחוב:</strong> {$orderData['address']}</p>
                <p style='margin: 5px 0;'><strong>עיר:</strong> {$orderData['city']}</p>
                <p style='margin: 5px 0;'><strong>מיקוד:</strong> {$orderData['zipcode']}</p>
            </div>

            <p style='margin-top: 30px; color: #666;'>תאריך הזמנה: " . date('d/m/Y H:i') . "</p>
        </div>
    </div>
    ";

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$siteName} <noreply@yanshouf.com>\r\n";

    return mail($adminEmail, "=?UTF-8?B?" . base64_encode($subject) . "?=", $message, $headers);
}

/**
 * Register new user
 */
function handleRegister() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Method not allowed', 405);
    }

    $input = getJsonInput();
    $email = trim($input['email'] ?? '');
    $synagogueName = trim($input['synagogue_name'] ?? '');
    $contactName = trim($input['contact_name'] ?? '');
    $phone = trim($input['phone'] ?? '');
    $address = trim($input['address'] ?? '');
    $city = trim($input['city'] ?? '');
    $zipcode = trim($input['zipcode'] ?? '');

    // Validation
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('נא להזין כתובת אימייל תקינה');
    }

    if (empty($synagogueName)) {
        jsonError('נא להזין שם בית הכנסת');
    }

    if (empty($contactName)) {
        jsonError('נא להזין שם איש קשר');
    }

    if (empty($phone)) {
        jsonError('נא להזין מספר טלפון');
    }

    if (empty($address) || empty($city)) {
        jsonError('נא להזין כתובת מלאה למשלוח');
    }

    $db = getDB();

    // Check if email exists
    $stmt = $db->prepare("SELECT id FROM app_users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonError('כתובת האימייל כבר רשומה במערכת');
    }

    // Generate random password
    $password = generateRandomPassword(8);

    // Create user with 1 year trial
    $token = generateApiToken();
    $trialEndsAt = date('Y-m-d H:i:s', strtotime('+1 year'));
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    // Build full address
    $fullAddress = $address . ', ' . $city . ($zipcode ? ' ' . $zipcode : '');

    $stmt = $db->prepare("INSERT INTO app_users (email, password_hash, synagogue_name, contact_name, phone, address, status, trial_ends_at, api_token) VALUES (?, ?, ?, ?, ?, ?, 'trial', ?, ?)");
    $stmt->execute([$email, $passwordHash, $synagogueName, $contactName, $phone, $fullAddress, $trialEndsAt, $token]);

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

    // Send welcome email to user with password
    sendWelcomeEmail($email, $contactName, $synagogueName, $password);

    // Send order notification to admin
    sendOrderNotificationEmail([
        'email' => $email,
        'synagogue_name' => $synagogueName,
        'contact_name' => $contactName,
        'phone' => $phone,
        'address' => $address,
        'city' => $city,
        'zipcode' => $zipcode ?: 'לא צוין'
    ]);

    logApiRequest($userId, 'auth/register', 'POST', ['email' => $email, 'synagogue_name' => $synagogueName], 201);

    jsonResponse([
        'success' => true,
        'message' => 'ההזמנה התקבלה בהצלחה! פרטי ההתחברות נשלחו לאימייל שלך.',
        'user' => [
            'id' => $userId,
            'email' => $email,
            'synagogue_name' => $synagogueName,
            'contact_name' => $contactName,
            'phone' => $phone,
            'status' => 'trial',
            'trial_ends_at' => $trialEndsAt
        ]
    ], 201);
}

/**
 * Logout - invalidate token
 */
function handleLogout() {
    $user = authenticateToken();

    $db = getDB();
    $stmt = $db->prepare("UPDATE app_users SET api_token = NULL WHERE id = ?");
    $stmt->execute([$user['id']]);

    logApiRequest($user['id'], 'auth/logout', 'POST', null, 200);

    jsonResponse(['success' => true, 'message' => 'Logged out successfully']);
}

/**
 * Refresh API token
 */
function handleRefreshToken() {
    $user = authenticateToken();

    $newToken = generateApiToken();
    $db = getDB();
    $stmt = $db->prepare("UPDATE app_users SET api_token = ? WHERE id = ?");
    $stmt->execute([$newToken, $user['id']]);

    logApiRequest($user['id'], 'auth/refresh', 'POST', null, 200);

    jsonResponse([
        'success' => true,
        'token' => $newToken
    ]);
}

/**
 * Get current user info
 */
function handleGetMe() {
    $user = authenticateToken();

    jsonResponse([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'synagogue_name' => $user['synagogue_name'],
            'contact_name' => $user['contact_name'],
            'phone' => $user['phone'],
            'address' => $user['address'],
            'status' => $user['status'],
            'trial_ends_at' => $user['trial_ends_at'],
            'subscription_expires_at' => $user['subscription_expires_at'],
            'last_sync_at' => $user['last_sync_at']
        ]
    ]);
}

/**
 * Handle forgot password - send new password to email
 */
function handleForgotPassword() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonError('Method not allowed', 405);
    }

    $input = getJsonInput();
    $email = trim($input['email'] ?? '');

    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonError('נא להזין כתובת אימייל תקינה');
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        // Don't reveal if email exists
        jsonResponse([
            'success' => true,
            'message' => 'אם האימייל קיים במערכת, נשלחה אליו סיסמה חדשה'
        ]);
        return;
    }

    // Generate new password
    $newPassword = generateRandomPassword(8);
    $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);

    // Update password in database
    $stmt = $db->prepare("UPDATE app_users SET password_hash = ? WHERE id = ?");
    $stmt->execute([$passwordHash, $user['id']]);

    // Send email with new password
    sendPasswordResetEmail($email, $user['contact_name'], $newPassword);

    logApiRequest($user['id'], 'auth/forgot-password', 'POST', ['email' => $email], 200);

    jsonResponse([
        'success' => true,
        'message' => 'סיסמה חדשה נשלחה לכתובת האימייל שלך'
    ]);
}

/**
 * Send password reset email
 */
function sendPasswordResetEmail($email, $contactName, $newPassword) {
    $siteName = getSetting('site_name', 'קלגבאי');
    $adminEmail = getSetting('admin_email', 'info@yanshouf.com');

    $subject = "שחזור סיסמה - {$siteName}";

    $message = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <link href='https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap' rel='stylesheet'>
    </head>
    <body style='margin: 0; padding: 0; font-family: Heebo, Tahoma, sans-serif;'>
    <div dir='rtl' style='font-family: Heebo, Tahoma, sans-serif; max-width: 600px; margin: 0 auto;'>
        <div style='background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;'>
            <h1 style='color: white; margin: 0; font-family: Heebo, Tahoma, sans-serif;'>{$siteName}</h1>
        </div>

        <div style='padding: 30px; background: #f8f9fa;'>
            <h2 style='color: #1e40af; font-family: Heebo, Tahoma, sans-serif;'>שלום {$contactName},</h2>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>קיבלנו בקשה לשחזור הסיסמה שלך.</p>

            <div style='background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #1e40af;'>
                <h3 style='color: #1e40af; margin-top: 0; font-family: Heebo, Tahoma, sans-serif;'>הסיסמה החדשה שלך:</h3>
                <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>אימייל:</strong> <a href='mailto:{$email}' style='color: #3b82f6;'>{$email}</a></p>
                <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>סיסמה:</strong> <span style='background: #e5e7eb; padding: 5px 10px; border-radius: 5px; font-family: monospace;'>{$newPassword}</span></p>
            </div>

            <p style='color: #666; font-family: Heebo, Tahoma, sans-serif;'>מומלץ לשמור את הסיסמה במקום בטוח.</p>

            <div style='background: #fef3c7; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #f59e0b;'>
                <p style='margin: 0; color: #92400e; font-family: Heebo, Tahoma, sans-serif;'><strong>שים לב:</strong> אם לא ביקשת לשחזר את הסיסמה, התעלם מהודעה זו.</p>
            </div>

            <p style='font-family: Heebo, Tahoma, sans-serif;'>בברכה,<br>צוות {$siteName}</p>
        </div>

        <div style='background: #1e40af; padding: 20px; text-align: center;'>
            <p style='color: white; margin: 0; font-size: 14px; font-family: Heebo, Tahoma, sans-serif;'>לשאלות ותמיכה: <a href='mailto:{$adminEmail}' style='color: white; text-decoration: underline;'>{$adminEmail}</a></p>
        </div>
    </div>
    </body>
    </html>
    ";

    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$siteName} <noreply@yanshouf.com>\r\n";

    return mail($email, "=?UTF-8?B?" . base64_encode($subject) . "?=", $message, $headers);
}
