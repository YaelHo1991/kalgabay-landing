<?php
/**
 * Email Templates API
 * Allows app to fetch email templates
 */

require_once __DIR__ . '/config.php';

// Authenticate user
$user = authenticateToken();

$method = $_SERVER['REQUEST_METHOD'];
$db = getDB();

// Default templates (fallback if not in database)
$defaultTemplates = [
    'payment_reminder' => [
        'template_key' => 'payment_reminder',
        'name' => 'תזכורת תשלום',
        'subject' => 'תזכורת תשלום - {synagogue_name}',
        'html_template' => '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body dir="rtl" style="font-family: Heebo, Segoe UI, Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8f4ef; margin: 0; padding: 20px;">
<div dir="rtl" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); direction: rtl; text-align: right; overflow: hidden;">
<div style="text-align: center; background: linear-gradient(135deg, #8B2E5C 0%, #6B2348 100%); padding: 30px 20px;">
<h1 dir="rtl" style="color: white; margin: 0; font-size: 28px; font-weight: 600;">{synagogue_name}</h1>
</div>
<div dir="rtl" style="white-space: pre-wrap; line-height: 1.9; color: #333; font-size: 16px; direction: rtl; text-align: right; padding: 30px;">
{custom_message}
</div>
<div dir="rtl" style="padding: 20px 30px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; background-color: #fafafa;">
<p>הודעה זו נשלחה ממערכת KalGabay</p>
</div>
</div>
</body>
</html>',
        'text_template' => '{custom_message}

בברכה,
{synagogue_name}',
        'variables' => 'member_name,synagogue_name,custom_message'
    ],
    'scan_confirmation' => [
        'template_key' => 'scan_confirmation',
        'name' => 'אישור רכישה',
        'subject' => 'אישור רכישה - {synagogue_name}',
        'html_template' => '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body dir="rtl" style="font-family: Heebo, Segoe UI, Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8f4ef; margin: 0; padding: 20px;">
<div dir="rtl" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); direction: rtl; text-align: right; overflow: hidden;">
<div style="text-align: center; background: linear-gradient(135deg, #8B2E5C 0%, #6B2348 100%); padding: 30px 20px;">
<h1 dir="rtl" style="color: white; margin: 0; font-size: 28px; font-weight: 600;">{synagogue_name}</h1>
</div>
<div dir="rtl" style="line-height: 1.9; color: #333; font-size: 16px; direction: rtl; text-align: right; padding: 30px;">
<p dir="rtl" style="direction: rtl; text-align: right; margin: 0 0 12px 0;">שלום {member_name},</p>
<p dir="rtl" style="direction: rtl; text-align: right; margin: 0 0 12px 0;">תודה רבה על רכישת המצוות!</p>
<div dir="rtl" style="background: linear-gradient(135deg, #f8f4ef 0%, #f0e9e0 100%); padding: 20px; border-radius: 12px; margin: 20px 0; direction: rtl; text-align: right; border-right: 4px solid #8B2E5C;">{mitzvot_list}</div>
<p dir="rtl" style="font-weight: 600; font-size: 20px; color: #8B2E5C; direction: rtl; text-align: right; margin-top: 20px;">סה"כ: {total_amount} ₪</p>
<p dir="rtl" style="direction: rtl; text-align: right; margin: 0 0 12px 0;">ושבת שלום!</p>
</div>
<div dir="rtl" style="padding: 20px 30px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; background-color: #fafafa;">
<p>הודעה זו נשלחה ממערכת KalGabay</p>
</div>
</div>
</body>
</html>',
        'text_template' => 'שלום {member_name},

תודה רבה על רכישת המצוות:
{mitzvot_list}

סה"כ: {total_amount} ₪

ושבת שלום!

בברכה,
{synagogue_name}',
        'variables' => 'member_name,synagogue_name,mitzvot_list,total_amount'
    ]
];

// Check if email_templates table exists
$tableExists = false;
try {
    $result = $db->query("SHOW TABLES LIKE 'email_templates'");
    $tableExists = $result->rowCount() > 0;
} catch (Exception $e) {
    // Table doesn't exist or error checking
    $tableExists = false;
}

// Create table if it doesn't exist
if (!$tableExists) {
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS email_templates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            template_key VARCHAR(100) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            subject VARCHAR(500) NOT NULL,
            html_template TEXT NOT NULL,
            text_template TEXT,
            variables TEXT,
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $tableExists = true;
    } catch (Exception $e) {
        // Table creation failed - will use default templates only
        $tableExists = false;
    }
}

switch ($method) {
    case 'GET':
        // Get templates
        $templateKey = $_GET['key'] ?? null;

        if ($templateKey) {
            // Try to get from database first (if table exists)
            $template = null;
            if ($tableExists) {
                try {
                    $stmt = $db->prepare("SELECT template_key, template_name as name, subject, body_html as html_template, body_text as text_template, variables FROM email_templates WHERE template_key = ? AND is_active = 1");
                    $stmt->execute([$templateKey]);
                    $template = $stmt->fetch(PDO::FETCH_ASSOC);
                } catch (Exception $e) {
                    // Query failed, will use default
                    $template = null;
                }
            }

            // Return database template if found
            if ($template) {
                jsonResponse([
                    'success' => true,
                    'template' => $template
                ]);
            }

            // Return default template if exists
            if (isset($defaultTemplates[$templateKey])) {
                jsonResponse([
                    'success' => true,
                    'template' => $defaultTemplates[$templateKey]
                ]);
            }

            jsonError('Template not found', 404);
        } else {
            // Get all templates - merge database and defaults
            $templatesMap = $defaultTemplates; // Start with defaults

            if ($tableExists) {
                try {
                    $stmt = $db->query("SELECT template_key, template_name as name, subject, body_html as html_template, body_text as text_template, variables FROM email_templates WHERE is_active = 1");
                    $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);

                    // Override defaults with database templates
                    foreach ($templates as $template) {
                        $templatesMap[$template['template_key']] = $template;
                    }
                } catch (Exception $e) {
                    // Query failed, will return defaults only
                }
            }

            jsonResponse([
                'success' => true,
                'templates' => $templatesMap
            ]);
        }
        break;

    default:
        jsonError('Method not allowed', 405);
}
