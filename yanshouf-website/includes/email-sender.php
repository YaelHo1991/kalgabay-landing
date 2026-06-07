<?php
/**
 * Email Sender Helper
 * Centralized email sending function for the admin panel
 */

/**
 * Send a system email (HTML)
 *
 * @param string $to Recipient email address
 * @param string $subject Email subject
 * @param string $htmlBody HTML content
 * @param string $textBody Plain text content (fallback)
 * @return array ['success' => bool, 'error' => string|null]
 */
function sendSystemEmail($to, $subject, $htmlBody, $textBody = '') {
    // Validate email
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'כתובת מייל לא תקינה'];
    }

    // Get site name from database
    $siteName = 'KalGabay';
    try {
        $db = getDB();
        $result = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'site_name'");
        $row = $result->fetch();
        if ($row && !empty($row['setting_value'])) {
            $siteName = $row['setting_value'];
        }
    } catch (Exception $e) {
        // Use default site name
    }

    // Encode subject for UTF-8
    $encodedSubject = "=?UTF-8?B?" . base64_encode($subject) . "?=";

    // Generate boundary for multipart email
    $boundary = md5(time());

    // Build headers
    $headers = [
        "From: {$siteName} <noreply@yanshouf.com>",
        "Reply-To: noreply@yanshouf.com",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
        "X-Mailer: PHP/" . phpversion()
    ];

    // Build multipart body
    $body = "";

    // Plain text part
    if (!empty($textBody)) {
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
        $body .= chunk_split(base64_encode($textBody)) . "\r\n";
    }

    // HTML part
    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $body .= chunk_split(base64_encode($htmlBody)) . "\r\n";

    // End boundary
    $body .= "--{$boundary}--";

    // Send email
    $sent = @mail($to, $encodedSubject, $body, implode("\r\n", $headers));

    if ($sent) {
        error_log("Email sent successfully to: {$to}");
        return ['success' => true, 'error' => null];
    } else {
        error_log("Failed to send email to: {$to}");
        return ['success' => false, 'error' => 'שגיאה בשליחת המייל. בדוק את הגדרות השרת.'];
    }
}
