<?php
/**
 * Contact Form Handler
 * Sends email using PHP mail() function
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
    exit;
}

// Get form data
$name = sanitize($_POST['name'] ?? '');
$email = sanitize($_POST['email'] ?? '');
$phone = sanitize($_POST['phone'] ?? '');
$message = sanitize($_POST['message'] ?? '');

// Validation
if (empty($name) || empty($email) || empty($message)) {
    echo json_encode(['success' => false, 'message' => 'נא למלא את כל השדות הנדרשים']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'כתובת אימייל לא תקינה']);
    exit;
}

// Get contact email from settings
$db = getDB();
$result = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'contact_email'");
$row = $result->fetch();
$toEmail = $row['setting_value'] ?? 'contact@yanshouf.com';

// Get site name
$result = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'site_name'");
$row = $result->fetch();
$siteName = $row['setting_value'] ?? 'קלגבאי';

// Prepare email
$subject = "=?UTF-8?B?" . base64_encode("פנייה חדשה מאתר $siteName") . "?=";

$emailBody = "
פנייה חדשה התקבלה מאתר $siteName
==========================================

שם: $name
אימייל: $email
טלפון: $phone

הודעה:
$message

==========================================
נשלח מטופס צור קשר באתר
";

$headers = [
    "From: $siteName <contact@yanshouf.com>",
    "Reply-To: $name <$email>",
    "Content-Type: text/plain; charset=UTF-8",
    "X-Mailer: PHP/" . phpversion()
];

// Log for debugging
error_log("Attempting to send email to: $toEmail");
error_log("From: noreply@yanshouf.com");

// Send email
$sent = @mail($toEmail, $subject, $emailBody, implode("\r\n", $headers));

error_log("Mail result: " . ($sent ? "success" : "failed"));

if ($sent) {
    // Save to database for record keeping
    try {
        $stmt = $db->prepare("INSERT INTO contact_messages (name, email, phone, message, created_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$name, $email, $phone, $message]);
    } catch (Exception $e) {
        // Table might not exist yet, that's ok
    }

    echo json_encode(['success' => true, 'message' => 'ההודעה נשלחה בהצלחה! נחזור אליך בהקדם.']);
} else {
    echo json_encode(['success' => false, 'message' => 'שגיאה בשליחת ההודעה. נסה שוב מאוחר יותר.']);
}
