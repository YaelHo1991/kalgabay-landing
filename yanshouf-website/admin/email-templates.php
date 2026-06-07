<?php
/**
 * Admin Panel - Email Templates Management
 * Manage email templates that are sent to members:
 * - scan_confirmation: After scanning and assigning mitzvot to a member
 * - payment_reminder: Payment reminder email
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$error = '';
$success = '';

// Create table if not exists
$db->exec("CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_key VARCHAR(50) NOT NULL UNIQUE,
    template_name VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    description TEXT,
    variables TEXT COMMENT 'JSON list of available variables',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

// Insert default templates if they don't exist
$defaultTemplates = [
    [
        'key' => 'scan_confirmation',
        'name' => 'אישור רכישת מצוות',
        'subject' => 'אישור רכישת מצוות - {synagogue_name}',
        'description' => 'נשלח למתפלל לאחר סריקת QR ושיוך מצוות',
        'variables' => json_encode([
            '{member_name}' => 'שם המתפלל',
            '{member_first_name}' => 'שם פרטי',
            '{member_last_name}' => 'שם משפחה',
            '{synagogue_name}' => 'שם בית הכנסת',
            '{mitzvot_list}' => 'רשימת המצוות (טבלה)',
            '{mitzvot_text}' => 'רשימת המצוות (טקסט)',
            '{total_amount}' => 'סכום כולל',
            '{parasha_name}' => 'שם הפרשה',
            '{shabbat_date}' => 'תאריך השבת',
            '{date}' => 'תאריך נוכחי'
        ]),
        'body_html' => '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1E5AA8, #163D75); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .mitzvot-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .mitzvot-table th { background: #f8f9fa; padding: 12px; border-bottom: 2px solid #1E5AA8; text-align: right; }
        .mitzvot-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .total-row { background: #e8f4fd; font-weight: bold; }
        .parasha-info { background: #fef3cd; padding: 15px; border-radius: 10px; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{synagogue_name}</h1>
        </div>
        <div class="content">
            <p class="greeting">שלום {member_name},</p>
            <p>תודה על רכישת המצוות! להלן פרטי הרכישה:</p>

            <div class="parasha-info">
                <strong>פרשת {parasha_name}</strong> - {shabbat_date}
            </div>

            {mitzvot_list}

            <p style="margin-top: 30px;">
                תזכו למצוות!<br>
                <strong>{synagogue_name}</strong>
            </p>
        </div>
        <div class="footer">
            <p>הודעה זו נשלחה ממערכת KalGabay</p>
            <p>{date}</p>
        </div>
    </div>
</body>
</html>',
        'body_text' => 'שלום {member_name},

תודה על רכישת המצוות!

פרשת {parasha_name} - {shabbat_date}

{mitzvot_text}

סה"כ: {total_amount}

תזכו למצוות!
{synagogue_name}'
    ],
    [
        'key' => 'payment_reminder',
        'name' => 'תזכורת תשלום',
        'subject' => 'תזכורת תשלום - {synagogue_name}',
        'description' => 'נשלח למתפלל כתזכורת לתשלום',
        'variables' => json_encode([
            '{member_name}' => 'שם המתפלל',
            '{member_first_name}' => 'שם פרטי',
            '{member_last_name}' => 'שם משפחה',
            '{synagogue_name}' => 'שם בית הכנסת',
            '{unpaid_list}' => 'רשימת מצוות שלא שולמו (טבלה)',
            '{unpaid_text}' => 'רשימת מצוות שלא שולמו (טקסט)',
            '{total_unpaid}' => 'סכום לתשלום',
            '{custom_message}' => 'הודעה אישית',
            '{date}' => 'תאריך נוכחי'
        ]),
        'body_html' => '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; direction: rtl; text-align: right; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1E5AA8, #163D75); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .reminder-box { background: #fff3cd; padding: 20px; border-radius: 10px; margin: 20px 0; border-right: 4px solid #ffc107; }
        .unpaid-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .unpaid-table th { background: #f8f9fa; padding: 12px; border-bottom: 2px solid #1E5AA8; text-align: right; }
        .unpaid-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .total-row { background: #ffe0e0; font-weight: bold; color: #c62828; }
        .custom-message { background: #f0f7ff; padding: 15px; border-radius: 10px; margin: 20px 0; white-space: pre-wrap; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{synagogue_name}</h1>
        </div>
        <div class="content">
            <p class="greeting">שלום {member_name},</p>

            <div class="reminder-box">
                <strong>תזכורת:</strong> יש לך תשלום פתוח עבור מצוות שרכשת.
            </div>

            {unpaid_list}

            {custom_message}

            <p style="margin-top: 30px;">
                בברכה,<br>
                <strong>{synagogue_name}</strong>
            </p>
        </div>
        <div class="footer">
            <p>הודעה זו נשלחה ממערכת KalGabay</p>
            <p>{date}</p>
        </div>
    </div>
</body>
</html>',
        'body_text' => 'שלום {member_name},

תזכורת: יש לך תשלום פתוח עבור מצוות שרכשת.

{unpaid_text}

סה"כ לתשלום: {total_unpaid}

{custom_message}

בברכה,
{synagogue_name}'
    ]
];

foreach ($defaultTemplates as $tpl) {
    $check = $db->prepare("SELECT id FROM email_templates WHERE template_key = ?");
    $check->execute([$tpl['key']]);
    if (!$check->fetch()) {
        $stmt = $db->prepare("INSERT INTO email_templates (template_key, template_name, subject, body_html, body_text, description, variables) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$tpl['key'], $tpl['name'], $tpl['subject'], $tpl['body_html'], $tpl['body_text'], $tpl['description'], $tpl['variables']]);
    }
}

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'send_sample_email') {
        $templateKey = $_POST['template_key'] ?? '';
        $recipientEmail = trim($_POST['recipient_email'] ?? '');

        if (empty($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            $error = 'נא להזין כתובת מייל תקינה';
        } else {
            require_once __DIR__ . '/../includes/email-sender.php';
            $siteName = getSetting('site_name', 'קלגבאי');
            $sampleBadge = '<div style="background:#ff9800;color:white;padding:10px 20px;text-align:center;font-weight:bold;">📧 זהו מייל לדוגמא בלבד</div>';

            // Handle server-side emails (registration, password reset)
            if ($templateKey === 'welcome_registration') {
                // Sample welcome/registration email
                $subject = "ברוכים הבאים ל-{$siteName} - פרטי ההתחברות שלך [לדוגמא]";
                $bodyHtml = "
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset='UTF-8'>
                    <link href='https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap' rel='stylesheet'>
                </head>
                <body style='margin: 0; padding: 0; font-family: Heebo, Tahoma, sans-serif;'>
                {$sampleBadge}
                <div dir='rtl' style='font-family: Heebo, Tahoma, sans-serif; max-width: 600px; margin: 0 auto;'>
                    <div style='background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;'>
                        <h1 style='color: white; margin: 0; font-family: Heebo, Tahoma, sans-serif;'>{$siteName}</h1>
                    </div>

                    <div style='padding: 30px; background: #f8f9fa;'>
                        <h2 style='color: #1e40af; font-family: Heebo, Tahoma, sans-serif;'>שלום ישראל ישראלי,</h2>

                        <p style='font-family: Heebo, Tahoma, sans-serif;'>תודה שהזמנת את ערכת {$siteName} עבור <strong>בית הכנסת לדוגמא</strong>!</p>

                        <p style='font-family: Heebo, Tahoma, sans-serif;'>ההזמנה שלך התקבלה בהצלחה וערכת הקלגבאי תישלח לכתובת שציינת בהקדם.</p>

                        <div style='background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #1e40af;'>
                            <h3 style='color: #1e40af; margin-top: 0; font-family: Heebo, Tahoma, sans-serif;'>פרטי ההתחברות שלך:</h3>
                            <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>אימייל:</strong> <span style='color: #3b82f6;'>sample@example.com</span></p>
                            <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>סיסמה:</strong> <span style='background: #e5e7eb; padding: 5px 10px; border-radius: 5px; font-family: monospace;'>Ab12Cd34</span></p>
                        </div>

                        <p style='color: #666; font-family: Heebo, Tahoma, sans-serif;'>מומלץ לשמור את הסיסמה במקום בטוח או לשנות אותה לאחר ההתחברות הראשונה.</p>

                        <div style='background: #fef3c7; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #f59e0b;'>
                            <p style='margin: 0; color: #92400e; font-family: Heebo, Tahoma, sans-serif;'><strong>שנה חינם!</strong> נהנה משנה שלמה של שימוש חינמי באפליקציה.</p>
                        </div>

                        <p style='font-family: Heebo, Tahoma, sans-serif;'>בברכה,<br>צוות {$siteName}</p>
                    </div>

                    <div style='background: #1e40af; padding: 20px; text-align: center;'>
                        <p style='color: white; margin: 0; font-size: 14px; font-family: Heebo, Tahoma, sans-serif;'>לשאלות ותמיכה: <a href='mailto:info@yanshouf.com' style='color: white; text-decoration: underline;'>info@yanshouf.com</a></p>
                    </div>
                </div>
                </body>
                </html>
                ";
                $bodyText = "שלום ישראל ישראלי,\n\nתודה שהזמנת את ערכת {$siteName}!\n\nפרטי התחברות:\nאימייל: sample@example.com\nסיסמה: Ab12Cd34\n\nבברכה,\nצוות {$siteName}";

                $emailResult = sendSystemEmail($recipientEmail, $subject, $bodyHtml, $bodyText);

            } elseif ($templateKey === 'password_reset') {
                // Sample password reset email
                $subject = "שחזור סיסמה - {$siteName} [לדוגמא]";
                $bodyHtml = "
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset='UTF-8'>
                    <link href='https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap' rel='stylesheet'>
                </head>
                <body style='margin: 0; padding: 0; font-family: Heebo, Tahoma, sans-serif;'>
                {$sampleBadge}
                <div dir='rtl' style='font-family: Heebo, Tahoma, sans-serif; max-width: 600px; margin: 0 auto;'>
                    <div style='background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;'>
                        <h1 style='color: white; margin: 0; font-family: Heebo, Tahoma, sans-serif;'>{$siteName}</h1>
                    </div>

                    <div style='padding: 30px; background: #f8f9fa;'>
                        <h2 style='color: #1e40af; font-family: Heebo, Tahoma, sans-serif;'>שלום ישראל ישראלי,</h2>

                        <p style='font-family: Heebo, Tahoma, sans-serif;'>קיבלנו בקשה לשחזור הסיסמה שלך.</p>

                        <div style='background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #1e40af;'>
                            <h3 style='color: #1e40af; margin-top: 0; font-family: Heebo, Tahoma, sans-serif;'>הסיסמה החדשה שלך:</h3>
                            <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>אימייל:</strong> <span style='color: #3b82f6;'>sample@example.com</span></p>
                            <p style='font-family: Heebo, Tahoma, sans-serif;'><strong>סיסמה:</strong> <span style='background: #e5e7eb; padding: 5px 10px; border-radius: 5px; font-family: monospace;'>Xy78Zw90</span></p>
                        </div>

                        <p style='color: #666; font-family: Heebo, Tahoma, sans-serif;'>מומלץ לשמור את הסיסמה במקום בטוח.</p>

                        <div style='background: #fef3c7; padding: 15px; border-radius: 10px; margin: 20px 0; border: 1px solid #f59e0b;'>
                            <p style='margin: 0; color: #92400e; font-family: Heebo, Tahoma, sans-serif;'><strong>שים לב:</strong> אם לא ביקשת לשחזר את הסיסמה, התעלם מהודעה זו.</p>
                        </div>

                        <p style='font-family: Heebo, Tahoma, sans-serif;'>בברכה,<br>צוות {$siteName}</p>
                    </div>

                    <div style='background: #1e40af; padding: 20px; text-align: center;'>
                        <p style='color: white; margin: 0; font-size: 14px; font-family: Heebo, Tahoma, sans-serif;'>לשאלות ותמיכה: <a href='mailto:info@yanshouf.com' style='color: white; text-decoration: underline;'>info@yanshouf.com</a></p>
                    </div>
                </div>
                </body>
                </html>
                ";
                $bodyText = "שלום ישראל ישראלי,\n\nקיבלנו בקשה לשחזור הסיסמה שלך.\n\nהסיסמה החדשה שלך: Xy78Zw90\n\nבברכה,\nצוות {$siteName}";

                $emailResult = sendSystemEmail($recipientEmail, $subject, $bodyHtml, $bodyText);

            } else {
                // Handle app templates (from database)
                $stmt = $db->prepare("SELECT * FROM email_templates WHERE template_key = ?");
                $stmt->execute([$templateKey]);
                $template = $stmt->fetch();

                if ($template) {
                    // Sample data for preview
                    $sampleData = [
                        '{member_name}' => 'ישראל ישראלי (לדוגמא)',
                        '{member_first_name}' => 'ישראל',
                        '{member_last_name}' => 'ישראלי',
                        '{synagogue_name}' => 'בית הכנסת לדוגמא',
                        '{parasha_name}' => 'בהעלותך',
                        '{shabbat_date}' => date('d/m/Y', strtotime('next saturday')),
                        '{date}' => date('d/m/Y'),
                        '{total_amount}' => '₪360',
                        '{total_unpaid}' => '₪180',
                        '{mitzvot_list}' => '<table style="width:100%;border-collapse:collapse;margin:20px 0;"><tr style="background:#f8f9fa;"><th style="padding:12px;border-bottom:2px solid #1E5AA8;text-align:right;">מצווה</th><th style="padding:12px;border-bottom:2px solid #1E5AA8;text-align:right;">מחיר</th></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;">עליה לתורה - שלישי</td><td style="padding:12px;border-bottom:1px solid #eee;">₪180</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;">הגבהה</td><td style="padding:12px;border-bottom:1px solid #eee;">₪100</td></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;">פתיחת ההיכל</td><td style="padding:12px;border-bottom:1px solid #eee;">₪80</td></tr><tr style="background:#e8f4fd;font-weight:bold;"><td style="padding:12px;">סה"כ</td><td style="padding:12px;">₪360</td></tr></table>',
                        '{mitzvot_text}' => "• עליה לתורה - שלישי: ₪180\n• הגבהה: ₪100\n• פתיחת ההיכל: ₪80",
                        '{unpaid_list}' => '<table style="width:100%;border-collapse:collapse;margin:20px 0;"><tr style="background:#f8f9fa;"><th style="padding:12px;border-bottom:2px solid #1E5AA8;text-align:right;">מצווה</th><th style="padding:12px;border-bottom:2px solid #1E5AA8;text-align:right;">תאריך</th><th style="padding:12px;border-bottom:2px solid #1E5AA8;text-align:right;">סכום</th></tr><tr><td style="padding:12px;border-bottom:1px solid #eee;">עליה לתורה - רביעי</td><td style="padding:12px;border-bottom:1px solid #eee;">' . date('d/m/Y') . '</td><td style="padding:12px;border-bottom:1px solid #eee;">₪180</td></tr><tr style="background:#ffe0e0;font-weight:bold;color:#c62828;"><td colspan="2" style="padding:12px;">סה"כ לתשלום</td><td style="padding:12px;">₪180</td></tr></table>',
                        '{unpaid_text}' => "• עליה לתורה - רביעי (" . date('d/m/Y') . "): ₪180",
                        '{custom_message}' => '<div style="background:#f0f7ff;padding:15px;border-radius:10px;margin:20px 0;">ניתן לשלם במזומן או באמצעות העברה בנקאית.</div>'
                    ];

                    // Replace variables in subject and body
                    $subject = $template['subject'];
                    $bodyHtml = $template['body_html'];
                    $bodyText = $template['body_text'];

                    foreach ($sampleData as $var => $value) {
                        $subject = str_replace($var, $value, $subject);
                        $bodyHtml = str_replace($var, $value, $bodyHtml);
                        $bodyText = str_replace($var, $value, $bodyText);
                    }

                    // Add sample badge to the email
                    $bodyHtml = str_replace('<body>', '<body>' . $sampleBadge, $bodyHtml);

                    $emailResult = sendSystemEmail($recipientEmail, $subject . ' [לדוגמא]', $bodyHtml, $bodyText);
                } else {
                    $error = 'תבנית לא נמצאה';
                    $emailResult = ['success' => false];
                }
            }

            if (isset($emailResult) && $emailResult['success']) {
                $success = "מייל לדוגמא נשלח בהצלחה ל-{$recipientEmail}!";
            } elseif (!isset($error)) {
                $error = 'שגיאה בשליחת המייל: ' . ($emailResult['error'] ?? 'שגיאה לא ידועה');
            }
        }
    }

    if ($action === 'update_template') {
        $templateId = (int)$_POST['template_id'];
        $subject = trim($_POST['subject'] ?? '');
        $bodyHtml = $_POST['body_html'] ?? '';
        $bodyText = $_POST['body_text'] ?? '';
        $isActive = isset($_POST['is_active']) ? 1 : 0;

        if (empty($subject)) {
            $error = 'נא למלא את נושא המייל';
        } else {
            $stmt = $db->prepare("UPDATE email_templates SET subject = ?, body_html = ?, body_text = ?, is_active = ? WHERE id = ?");
            $stmt->execute([$subject, $bodyHtml, $bodyText, $isActive, $templateId]);
            $success = 'התבנית עודכנה בהצלחה!';
        }
    }
}

// Get all templates
$templates = $db->query("SELECT * FROM email_templates ORDER BY template_key")->fetchAll();

// View/Edit specific template
$editTemplate = null;
if (isset($_GET['edit'])) {
    $editId = (int)$_GET['edit'];
    $stmt = $db->prepare("SELECT * FROM email_templates WHERE id = ?");
    $stmt->execute([$editId]);
    $editTemplate = $stmt->fetch();
}

$pageTitle = "תבניות אימייל";
include 'includes/header.php';
?>

<style>
.templates-grid {
    display: grid;
    gap: 20px;
}
.template-card {
    background: white;
    border-radius: 15px;
    padding: 25px;
    box-shadow: 0 2px 15px rgba(0,0,0,0.05);
}
.template-card h3 {
    margin: 0 0 10px 0;
    color: #1e40af;
    display: flex;
    align-items: center;
    gap: 10px;
}
.template-card .description {
    color: #666;
    font-size: 0.95rem;
    margin-bottom: 15px;
}
.template-card .subject-preview {
    background: #f8f9fa;
    padding: 10px 15px;
    border-radius: 8px;
    margin-bottom: 15px;
    font-family: monospace;
}
.template-card .status {
    display: inline-block;
    padding: 5px 15px;
    border-radius: 20px;
    font-size: 0.85rem;
}
.template-card .status.active {
    background: #d1fae5;
    color: #065f46;
}
.template-card .status.inactive {
    background: #fee2e2;
    color: #991b1b;
}
.template-card .actions {
    margin-top: 15px;
    display: flex;
    gap: 10px;
}
.template-card .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.95rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.template-card .btn-primary {
    background: #1e40af;
    color: white;
}
.template-card .btn-secondary {
    background: #e5e7eb;
    color: #374151;
}

.edit-form {
    background: white;
    border-radius: 15px;
    padding: 30px;
    box-shadow: 0 2px 15px rgba(0,0,0,0.05);
}
.edit-form h2 {
    margin: 0 0 25px 0;
    color: #1e40af;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 15px;
}
.form-group {
    margin-bottom: 20px;
}
.form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #374151;
}
.form-group input[type="text"],
.form-group textarea {
    width: 100%;
    padding: 12px 15px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 1rem;
    font-family: inherit;
}
.form-group textarea {
    min-height: 200px;
    font-family: monospace;
    font-size: 0.9rem;
}
.form-group textarea.html-editor {
    min-height: 400px;
}
.form-group .help-text {
    font-size: 0.85rem;
    color: #666;
    margin-top: 5px;
}

.variables-box {
    background: #f0f7ff;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 25px;
}
.variables-box h4 {
    margin: 0 0 15px 0;
    color: #1e40af;
}
.variables-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 8px;
}
.variable-item {
    background: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.9rem;
}
.variable-item code {
    background: #e5e7eb;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    color: #1e40af;
}

.checkbox-group {
    display: flex;
    align-items: center;
    gap: 10px;
}
.checkbox-group input[type="checkbox"] {
    width: 20px;
    height: 20px;
}

.preview-section {
    margin-top: 30px;
    border-top: 2px solid #e5e7eb;
    padding-top: 25px;
}
.preview-section h3 {
    margin: 0 0 15px 0;
    color: #374151;
}
.preview-frame {
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 20px;
    max-height: 500px;
    overflow-y: auto;
}

.tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}
.tab {
    padding: 10px 20px;
    border: none;
    background: #e5e7eb;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    font-size: 0.95rem;
}
.tab.active {
    background: #1e40af;
    color: white;
}
</style>

<div class="email-templates-page">
    <?php if ($error): ?>
        <div class="alert alert-error"><?= $error ?></div>
    <?php endif; ?>
    <?php if ($success): ?>
        <div class="alert alert-success"><?= $success ?></div>
    <?php endif; ?>

    <?php if ($editTemplate): ?>
        <!-- Edit Template Form -->
        <div style="margin-bottom: 20px;">
            <a href="email-templates.php" class="btn btn-secondary">
                <i class="fas fa-arrow-right"></i> חזרה לרשימה
            </a>
        </div>

        <div class="edit-form">
            <h2><i class="fas fa-edit"></i> עריכת תבנית: <?= sanitize($editTemplate['template_name']) ?></h2>

            <div class="variables-box">
                <h4><i class="fas fa-code"></i> משתנים זמינים</h4>
                <p style="color:#666;margin-bottom:15px;">הוסף משתנים אלו בתבנית והם יוחלפו בערכים האמיתיים בעת שליחת המייל:</p>
                <div class="variables-list">
                    <?php
                    $variables = json_decode($editTemplate['variables'], true) ?: [];
                    foreach ($variables as $var => $desc):
                    ?>
                    <div class="variable-item">
                        <code><?= sanitize($var) ?></code> - <?= sanitize($desc) ?>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <form method="POST">
                <input type="hidden" name="action" value="update_template">
                <input type="hidden" name="template_id" value="<?= $editTemplate['id'] ?>">

                <div class="form-group">
                    <label>נושא המייל *</label>
                    <input type="text" name="subject" value="<?= sanitize($editTemplate['subject']) ?>" required>
                    <div class="help-text">ניתן להשתמש במשתנים גם בנושא, למשל: {synagogue_name}</div>
                </div>

                <!-- Hidden HTML field - preserved but not editable by user -->
                <input type="hidden" name="body_html" value="<?= htmlspecialchars($editTemplate['body_html'], ENT_QUOTES, 'UTF-8') ?>">

                <div class="form-group">
                    <label>תוכן הודעה</label>
                    <textarea name="body_text" style="min-height: 250px;"><?= sanitize($editTemplate['body_text']) ?></textarea>
                    <div class="help-text">תוכן ההודעה שתישלח למתפלל. השתמש במשתנים שיוחלפו בזמן שליחה.</div>
                </div>

                <div class="form-group">
                    <label class="checkbox-group">
                        <input type="checkbox" name="is_active" <?= $editTemplate['is_active'] ? 'checked' : '' ?>>
                        תבנית פעילה
                    </label>
                </div>

                <div style="display:flex;gap:15px;">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> שמור שינויים
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="previewTemplate()">
                        <i class="fas fa-eye"></i> תצוגה מקדימה
                    </button>
                </div>
            </form>

            <div class="preview-section" id="previewSection" style="display:none;">
                <h3><i class="fas fa-eye"></i> תצוגה מקדימה</h3>
                <div class="preview-frame">
                    <iframe id="previewFrame" style="width:100%;height:400px;border:none;"></iframe>
                </div>
            </div>
        </div>

        <script>
        function previewTemplate() {
            const html = document.querySelector('textarea[name="body_html"]').value;
            const previewSection = document.getElementById('previewSection');
            const previewFrame = document.getElementById('previewFrame');

            // Replace variables with sample data for preview
            const sampleData = {
                '{member_name}': 'ישראל ישראלי',
                '{member_first_name}': 'ישראל',
                '{member_last_name}': 'ישראלי',
                '{synagogue_name}': 'בית הכנסת לדוגמה',
                '{parasha_name}': 'בהעלותך',
                '{shabbat_date}': '15/06/2024',
                '{date}': new Date().toLocaleDateString('he-IL'),
                '{total_amount}': '₪500',
                '{total_unpaid}': '₪500',
                '{mitzvot_list}': '<table class="mitzvot-table"><tr><th>מצווה</th><th>מחיר</th></tr><tr><td>פתיחת ההיכל</td><td>₪100</td></tr><tr><td>עליה לתורה</td><td>₪200</td></tr><tr class="total-row"><td>סה"כ</td><td>₪300</td></tr></table>',
                '{mitzvot_text}': '- פתיחת ההיכל: ₪100\\n- עליה לתורה: ₪200',
                '{unpaid_list}': '<table class="unpaid-table"><tr><th>מצווה</th><th>תאריך</th><th>סכום</th></tr><tr><td>הגבהה</td><td>01/06/2024</td><td>₪150</td></tr><tr class="total-row"><td colspan="2">סה"כ לתשלום</td><td>₪150</td></tr></table>',
                '{unpaid_text}': '- הגבהה (01/06/2024): ₪150',
                '{custom_message}': '<div class="custom-message">נשמח לראותך בשבת הקרובה!</div>'
            };

            let previewHtml = html;
            for (const [key, value] of Object.entries(sampleData)) {
                previewHtml = previewHtml.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
            }

            previewFrame.srcdoc = previewHtml;
            previewSection.style.display = 'block';
            previewSection.scrollIntoView({ behavior: 'smooth' });
        }
        </script>

    <?php else: ?>
        <!-- Templates List -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:25px;">
            <h1 style="margin:0;"><i class="fas fa-envelope-open-text"></i> תבניות אימייל</h1>
        </div>

        <p style="color:#666;margin-bottom:25px;">
            כאן ניתן לערוך את תבניות האימייל שנשלחות למתפללים מתוך האפליקציה.
            כל תבנית מכילה משתנים שמוחלפים אוטומטית בערכים האמיתיים בזמן השליחה.
        </p>

        <!-- Sample Email Section -->
        <div class="template-card" style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 2px solid #fb923c; margin-bottom: 30px;">
            <h3 style="color: #c2410c;">
                <i class="fas fa-paper-plane"></i>
                שליחת מיילים לדוגמא
            </h3>
            <p class="description">
                שלח מייל לדוגמא לכתובת שתבחר כדי לראות איך המיילים נראים בפועל.
                המיילים יכללו נתונים לדוגמא ויסומנו כ"לדוגמא בלבד".
            </p>

            <form method="POST" style="margin-top: 20px;">
                <input type="hidden" name="action" value="send_sample_email">

                <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                    <div style="flex: 1; min-width: 250px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                            כתובת מייל לשליחה
                        </label>
                        <input type="email" name="recipient_email" placeholder="your.email@example.com" required
                            style="width: 100%; padding: 12px 15px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; direction: ltr;">
                    </div>

                    <div style="flex: 1; min-width: 200px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                            סוג המייל
                        </label>
                        <select name="template_key" required
                            style="width: 100%; padding: 12px 15px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; background: white;">
                            <optgroup label="מיילים מהשרת">
                                <option value="welcome_registration">מייל רישום (ברוכים הבאים)</option>
                                <option value="password_reset">מייל שחזור סיסמא</option>
                            </optgroup>
                            <optgroup label="מיילים מהאפליקציה">
                                <option value="scan_confirmation">מייל אישור רכישה</option>
                                <option value="payment_reminder">מייל תזכורת תשלום</option>
                            </optgroup>
                        </select>
                    </div>

                    <button type="submit" class="btn btn-primary" style="background: #ea580c; padding: 12px 25px;">
                        <i class="fas fa-paper-plane"></i>
                        שלח מייל לדוגמא
                    </button>
                </div>
            </form>
        </div>

        <div class="templates-grid">
            <?php foreach ($templates as $template): ?>
            <div class="template-card">
                <h3>
                    <?php if ($template['template_key'] === 'scan_confirmation'): ?>
                        <i class="fas fa-qrcode" style="color:#10b981;"></i>
                    <?php else: ?>
                        <i class="fas fa-bell" style="color:#f59e0b;"></i>
                    <?php endif; ?>
                    <?= sanitize($template['template_name']) ?>
                </h3>
                <p class="description"><?= sanitize($template['description']) ?></p>
                <div class="subject-preview">
                    <strong>נושא:</strong> <?= sanitize($template['subject']) ?>
                </div>
                <span class="status <?= $template['is_active'] ? 'active' : 'inactive' ?>">
                    <?= $template['is_active'] ? 'פעיל' : 'לא פעיל' ?>
                </span>
                <div class="actions">
                    <a href="email-templates.php?edit=<?= $template['id'] ?>" class="btn btn-primary">
                        <i class="fas fa-edit"></i> ערוך תבנית
                    </a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <?php if (empty($templates)): ?>
        <div style="text-align:center;padding:60px;background:white;border-radius:15px;">
            <i class="fas fa-envelope-open-text" style="font-size:4rem;color:#ddd;margin-bottom:20px;display:block;"></i>
            <p style="color:#666;font-size:1.2rem;">אין תבניות להצגה</p>
        </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<?php include 'includes/footer.php'; ?>
