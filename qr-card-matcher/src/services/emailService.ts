/**
 * Email Service - Gmail API with Resend fallback
 * ==============================================
 * Priority:
 * 1. Gmail API (if connected) - 500 emails/day per user, free
 * 2. Resend API (fallback) - 100 emails/day shared, requires API key
 *
 * NOTE: On Android, we use Tauri's Rust backend for Gmail API calls
 * to avoid CORS/WebView issues with direct fetch.
 */

import { invoke } from '@tauri-apps/api/core';
import { getSetting, setSetting } from '../database';
import { isGmailConnected, getGmailAccessToken, getGmailEmail, getGmailUserName } from './gmailService';

// Settings keys for Resend fallback
const RESEND_API_KEY_SETTING = 'resend_api_key';
const SENDER_EMAIL_SETTING = 'sender_email';
const SENDER_NAME_SETTING = 'sender_name';

// API endpoints
const RESEND_API_URL = 'https://api.resend.com/emails';
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface EmailConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  method?: 'gmail' | 'resend';
}

/**
 * Get the saved Resend email configuration
 */
export async function getEmailConfig(): Promise<EmailConfig | null> {
  try {
    const apiKey = await getSetting(RESEND_API_KEY_SETTING);
    const senderEmail = await getSetting(SENDER_EMAIL_SETTING);
    const senderName = await getSetting(SENDER_NAME_SETTING);

    if (!apiKey) {
      return null;
    }

    return {
      apiKey,
      senderEmail: senderEmail || 'onboarding@resend.dev',
      senderName: senderName || 'KalGabay'
    };
  } catch (error) {
    console.error('Error getting email config:', error);
    return null;
  }
}

/**
 * Save Resend email configuration
 */
export async function saveEmailConfig(config: Partial<EmailConfig>): Promise<boolean> {
  try {
    if (config.apiKey !== undefined) {
      await setSetting(RESEND_API_KEY_SETTING, config.apiKey);
    }
    if (config.senderEmail !== undefined) {
      await setSetting(SENDER_EMAIL_SETTING, config.senderEmail);
    }
    if (config.senderName !== undefined) {
      await setSetting(SENDER_NAME_SETTING, config.senderName);
    }
    return true;
  } catch (error) {
    console.error('Error saving email config:', error);
    return false;
  }
}

/**
 * Create RFC 2822 formatted email for Gmail API
 */
function createRawEmail(to: string, from: string, subject: string, htmlBody: string, textBody: string): string {
  const boundary = `boundary_${Date.now()}`;

  const email = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(textBody))),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(htmlBody))),
    '',
    `--${boundary}--`
  ].join('\r\n');

  // Convert to base64url format (required by Gmail API)
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email via Gmail API using Rust backend
 * This is more reliable on Android than direct fetch due to CORS/WebView issues
 */
async function sendViaGmail(params: SendEmailParams): Promise<SendEmailResult> {
  // Get access token (will refresh if needed)
  const accessToken = await getGmailAccessToken();
  const senderEmail = getGmailEmail();
  const senderName = getGmailUserName() || senderEmail;

  if (!accessToken || !senderEmail) {
    return {
      success: false,
      error: 'Gmail לא מחובר. אנא התחבר מחדש.',
      method: 'gmail'
    };
  }

  try {
    // Use Rust backend for Gmail API call - more reliable on Android
    console.log('Sending email via Rust backend...');
    console.log('To:', params.to);
    console.log('Subject:', params.subject);

    await invoke('send_email_gmail', {
      accessToken,
      toEmail: params.to,
      toName: params.to.split('@')[0], // Use email prefix as name if not provided
      subject: params.subject,
      body: params.html || params.text || '',
      fromEmail: senderEmail,
      fromName: senderName
    });

    console.log('Email sent successfully via Rust backend');
    return {
      success: true,
      method: 'gmail'
    };
  } catch (error) {
    console.error('Gmail API error (Rust):', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle specific Gmail errors
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('invalid_grant')) {
      return {
        success: false,
        error: 'פג תוקף ההרשאה. אנא התחבר מחדש ל-Gmail.',
        method: 'gmail'
      };
    }

    return {
      success: false,
      error: errorMessage || 'שגיאה בשליחת המייל',
      method: 'gmail'
    };
  }
}

/**
 * Send email via Resend API (fallback)
 */
async function sendViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  const config = await getEmailConfig();

  if (!config || !config.apiKey) {
    return {
      success: false,
      error: 'שירות המייל לא מוגדר. אנא חבר Gmail או הוסף מפתח Resend בהגדרות.',
      method: 'resend'
    };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${config.senderName} <${config.senderEmail}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text
      })
    });

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        messageId: data.id,
        method: 'resend'
      };
    } else {
      return {
        success: false,
        error: data.message || data.error || 'שגיאה בשליחת המייל',
        method: 'resend'
      };
    }
  } catch (error) {
    console.error('Resend API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'שגיאת רשת בשליחת המייל',
      method: 'resend'
    };
  }
}

/**
 * Send an email - automatically chooses best method
 * Priority: Gmail API > Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // Validate recipient
  if (!params.to) {
    return {
      success: false,
      error: 'כתובת מייל נדרשת.'
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(params.to)) {
    return {
      success: false,
      error: 'כתובת מייל לא תקינה.'
    };
  }

  // Try Gmail first (if connected)
  if (isGmailConnected()) {
    console.log('Sending via Gmail API...');
    const result = await sendViaGmail(params);

    // If Gmail succeeded, return
    if (result.success) {
      return result;
    }

    // If Gmail failed due to auth, don't fallback (user should reconnect)
    if (result.error?.includes('פג תוקף') || result.error?.includes('התחבר מחדש')) {
      return result;
    }

    // For other Gmail errors, try Resend fallback
    console.log('Gmail failed, trying Resend fallback...');
  }

  // Fallback to Resend
  return sendViaResend(params);
}

/**
 * Check which email method is available
 */
export function getEmailMethod(): 'gmail' | 'resend' | 'none' {
  if (isGmailConnected()) {
    return 'gmail';
  }
  // Note: We can't check Resend config synchronously
  return 'none';
}

/**
 * Check if any email method is available
 */
export async function isEmailConfigured(): Promise<boolean> {
  if (isGmailConnected()) {
    return true;
  }
  const resendConfig = await getEmailConfig();
  return !!resendConfig?.apiKey;
}

// Default templates - using inline styles for Gmail compatibility
const DEFAULT_TEMPLATES: Record<string, { subject: string; html: string; text: string }> = {
  payment_reminder: {
    subject: 'סיכום רכישה - {synagogue_name}',
    html: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8f4ef; margin: 0; padding: 20px;">
  <div dir="rtl" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="text-align: center; background: linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%); padding: 30px 20px;">
      <h1 dir="rtl" style="color: white; margin: 0; font-size: 28px; font-weight: 600;">{synagogue_name}</h1>
    </div>
    <div dir="rtl" style="white-space: pre-wrap; line-height: 1.5; color: #333; font-size: 16px; padding: 30px; direction: rtl; text-align: right;">{custom_message}</div>
    <div dir="rtl" style="padding: 20px 30px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; background-color: #fafafa;">
      <p style="margin: 0;">הודעה זו נשלחה ממערכת KalGabay</p>
    </div>
  </div>
</body>
</html>`,
    text: '{custom_message}'
  },
  scan_confirmation: {
    subject: 'סיכום רכישה - {synagogue_name}',
    html: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8f4ef; margin: 0; padding: 20px;">
  <div dir="rtl" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
    <div style="text-align: center; background: linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%); padding: 30px 20px;">
      <h1 dir="rtl" style="color: white; margin: 0; font-size: 28px; font-weight: 600;">{synagogue_name}</h1>
    </div>
    <div dir="rtl" style="line-height: 1.5; color: #333; font-size: 16px; padding: 30px; direction: rtl; text-align: right;">
      <p dir="rtl" style="margin: 0 0 12px 0;">שלום {member_name},</p>
      <p dir="rtl" style="margin: 0 0 12px 0;">תודה רבה על רכישת המצוות!</p>
      <div dir="rtl" style="background: linear-gradient(135deg, #e8f4fc 0%, #d4ebf7 100%); padding: 20px; border-radius: 12px; margin: 20px 0; border-right: 4px solid #1E5AA8;">{mitzvot_list}</div>
      <p dir="rtl" style="font-weight: 600; font-size: 20px; color: #1E5AA8; margin-top: 20px;">סה"כ: {total_amount} ₪</p>
      <p dir="rtl" style="margin: 12px 0 0 0;">ושבת שלום!</p>
    </div>
    <div dir="rtl" style="padding: 20px 30px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; background-color: #fafafa;">
      <p style="margin: 0;">הודעה זו נשלחה ממערכת KalGabay</p>
    </div>
  </div>
</body>
</html>`,
    text: 'שלום {member_name},\n\nתודה רבה על רכישת המצוות:\n{mitzvot_list}\n\nסה"כ: {total_amount} ₪\n\nושבת שלום!\n\n{synagogue_name}'
  }
};

/**
 * Replace template variables with actual values
 */
function processTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Get email template - always use local defaults for consistent styling
 * Server templates are currently not used to ensure RTL and design consistency
 */
function getTemplate(templateKey: string): { subject: string; html: string; text: string } {
  // Always use local templates for consistent styling
  return DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES.payment_reminder;
}

/**
 * Send a payment reminder email
 */
export async function sendPaymentReminder(
  recipientEmail: string,
  recipientName: string,
  message: string,
  synagogueName: string = 'בית הכנסת',
  customSubject?: string
): Promise<SendEmailResult> {
  const template = getTemplate('payment_reminder');

  const variables = {
    member_name: recipientName || 'מתפלל יקר',
    synagogue_name: synagogueName,
    custom_message: message.replace(/\n/g, '<br>')
  };

  // Use custom subject if provided, otherwise use template subject
  const subject = customSubject
    ? processTemplate(customSubject, variables)
    : processTemplate(template.subject, variables);
  const htmlContent = processTemplate(template.html, variables);
  const textContent = processTemplate(template.text, { ...variables, custom_message: message });

  return sendEmail({
    to: recipientEmail,
    subject,
    html: htmlContent,
    text: textContent
  });
}

/**
 * Send scan confirmation email with list of purchased mitzvot
 */
export async function sendScanConfirmation(
  recipientEmail: string,
  recipientName: string,
  mitzvotList: string[],
  totalAmount: number,
  synagogueName: string = 'בית הכנסת'
): Promise<SendEmailResult> {
  const template = getTemplate('scan_confirmation');

  // Format mitzvot list as HTML and text
  const mitzvotHtml = mitzvotList.map(m => `• ${m}`).join('<br>');
  const mitzvotText = mitzvotList.map(m => `• ${m}`).join('\n');

  const variables = {
    member_name: recipientName || 'מתפלל יקר',
    synagogue_name: synagogueName,
    mitzvot_list: mitzvotHtml,
    total_amount: totalAmount.toLocaleString()
  };

  const subject = processTemplate(template.subject, variables);
  const htmlContent = processTemplate(template.html, variables);
  const textContent = processTemplate(template.text, { ...variables, mitzvot_list: mitzvotText });

  return sendEmail({
    to: recipientEmail,
    subject,
    html: htmlContent,
    text: textContent
  });
}

/**
 * Test email configuration by sending a test email
 */
export async function testEmailConfig(testEmail: string): Promise<SendEmailResult> {
  const method = isGmailConnected() ? 'Gmail' : 'Resend';

  return sendEmail({
    to: testEmail,
    subject: 'בדיקת הגדרות מייל - KalGabay',
    html: `
      <div dir="rtl" style="font-family: Arial; text-align: right; padding: 20px;">
        <h2 style="color: #1E5AA8;">בדיקת הגדרות מייל</h2>
        <p>אם קיבלת הודעה זו, הגדרות המייל שלך עובדות כראוי!</p>
        <p style="color: #666; margin-top: 15px;">
          <strong>שיטת שליחה:</strong> ${method}
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 20px;">
          נשלח ממערכת KalGabay
        </p>
      </div>
    `,
    text: `בדיקת הגדרות מייל - אם קיבלת הודעה זו, הגדרות המייל שלך עובדות כראוי! (שיטת שליחה: ${method})`
  });
}

/**
 * Sample email types for testing
 */
export type SampleEmailType = 'registration' | 'purchase_confirmation' | 'payment_reminder';

/**
 * Send a sample email for testing purposes
 * This allows admins to preview how emails will look without triggering real events
 */
export async function sendSampleEmail(
  type: SampleEmailType,
  recipientEmail: string,
  synagogueName: string = 'בית הכנסת לדוגמא'
): Promise<SendEmailResult> {
  const sampleData = {
    memberName: 'ישראל ישראלי',
    memberEmail: 'sample@example.com'
  };

  switch (type) {
    case 'registration':
      return sendEmail({
        to: recipientEmail,
        subject: `ברוכים הבאים ל-${synagogueName} - KalGabay`,
        html: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 2px solid #1E5AA8; padding-bottom: 20px; margin-bottom: 20px; }
    .header h1 { color: #1E5AA8; margin: 0; font-size: 24px; }
    .content { line-height: 1.8; color: #333; font-size: 16px; }
    .highlight { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
    .code { font-size: 28px; font-weight: bold; color: #1E5AA8; letter-spacing: 3px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
    .sample-badge { background: #ff9800; color: white; padding: 5px 15px; border-radius: 20px; font-size: 12px; display: inline-block; margin-bottom: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="sample-badge">📧 מייל לדוגמא</span>
      <h1>${synagogueName}</h1>
    </div>
    <div class="content">
      <p>שלום ${sampleData.memberName},</p>
      <p>ברוכים הבאים למערכת KalGabay!</p>
      <p>החשבון שלך נוצר בהצלחה. להלן קוד האימות שלך:</p>
      <div class="highlight">
        <span class="code">123456</span>
      </div>
      <p>קוד זה תקף ל-10 דקות.</p>
      <p>אם לא ביקשת ליצור חשבון, ניתן להתעלם ממייל זה.</p>
    </div>
    <div class="footer">
      <p>הודעה זו נשלחה ממערכת KalGabay</p>
      <p style="color: #ff9800; font-weight: bold;">⚠️ זהו מייל לדוגמא בלבד - לא נוצר חשבון אמיתי</p>
    </div>
  </div>
</body>
</html>`,
        text: `[מייל לדוגמא]\n\nשלום ${sampleData.memberName},\n\nברוכים הבאים למערכת KalGabay!\n\nקוד האימות שלך: 123456\n\n${synagogueName}`
      });

    case 'purchase_confirmation':
      const sampleMitzvot = ['עליה לתורה - שלישי', 'הגבהה', 'פתיחת ההיכל'];
      const sampleTotal = 360;
      return sendScanConfirmation(
        recipientEmail,
        sampleData.memberName + ' (לדוגמא)',
        sampleMitzvot,
        sampleTotal,
        synagogueName
      );

    case 'payment_reminder':
      const sampleMessage = `שלום ${sampleData.memberName},

זוהי תזכורת בנוגע לעליה לתורה - רביעי שרכשת השבת.

סכום לתשלום: ₪180

ניתן לשלם במזומן או באמצעות העברה בנקאית.

בברכה,
${synagogueName}`;
      return sendPaymentReminder(
        recipientEmail,
        sampleData.memberName + ' (לדוגמא)',
        sampleMessage,
        synagogueName
      );

    default:
      return {
        success: false,
        error: 'סוג מייל לא מוכר'
      };
  }
}
