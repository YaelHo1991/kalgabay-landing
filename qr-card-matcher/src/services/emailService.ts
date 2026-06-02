/**
 * Email Service - Gmail API with Resend fallback
 * ==============================================
 * Priority:
 * 1. Gmail API (if connected) - 500 emails/day per user, free
 * 2. Resend API (fallback) - 100 emails/day shared, requires API key
 */

import { getSetting, setSetting } from '../database';
import { isGmailConnected, getGmailAccessToken, getGmailEmail } from './gmailService';
import { apiGetEmailTemplate } from './apiService';

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
 * Send email via Gmail API
 */
async function sendViaGmail(params: SendEmailParams): Promise<SendEmailResult> {
  // Get access token (will refresh if needed)
  const accessToken = await getGmailAccessToken();
  const senderEmail = getGmailEmail();

  if (!accessToken || !senderEmail) {
    return {
      success: false,
      error: 'Gmail לא מחובר. אנא התחבר מחדש.',
      method: 'gmail'
    };
  }

  const rawEmail = createRawEmail(
    params.to,
    senderEmail,
    params.subject,
    params.html || params.text || '',
    params.text || ''
  );

  try {
    const response = await fetch(GMAIL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: rawEmail })
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        messageId: data.id,
        method: 'gmail'
      };
    }

    // Handle specific Gmail errors
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || 'שגיאה בשליחת המייל';

    if (response.status === 401) {
      return {
        success: false,
        error: 'פג תוקף ההרשאה. אנא התחבר מחדש ל-Gmail.',
        method: 'gmail'
      };
    }

    return {
      success: false,
      error: errorMessage,
      method: 'gmail'
    };
  } catch (error) {
    console.error('Gmail API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'שגיאת רשת בשליחת המייל',
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

// Default templates (fallback if server templates not available)
const DEFAULT_TEMPLATES: Record<string, { subject: string; html: string; text: string }> = {
  payment_reminder: {
    subject: 'תזכורת תשלום - {synagogue_name}',
    html: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; border-bottom: 2px solid #1E5AA8; padding-bottom: 20px; margin-bottom: 20px; }
    .header h1 { color: #1E5AA8; margin: 0; font-size: 24px; }
    .content { white-space: pre-wrap; line-height: 1.8; color: #333; font-size: 16px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>{synagogue_name}</h1></div>
    <div class="content">{custom_message}</div>
    <div class="footer"><p>הודעה זו נשלחה ממערכת KalGabay</p></div>
  </div>
</body>
</html>`,
    text: '{custom_message}'
  },
  scan_confirmation: {
    subject: 'אישור רכישה - {synagogue_name}',
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
    .mitzvot-list { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .total { font-weight: bold; font-size: 18px; color: #1E5AA8; margin-top: 15px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>{synagogue_name}</h1></div>
    <div class="content">
      <p>שלום {member_name},</p>
      <p>תודה רבה על רכישת המצוות הבאות:</p>
      <div class="mitzvot-list">{mitzvot_list}</div>
      <p class="total">סה"כ: {total_amount} ₪</p>
      <p>תזכו למצוות!</p>
    </div>
    <div class="footer"><p>הודעה זו נשלחה ממערכת KalGabay</p></div>
  </div>
</body>
</html>`,
    text: 'שלום {member_name},\n\nתודה רבה על רכישת המצוות:\n{mitzvot_list}\n\nסה"כ: {total_amount} ₪\n\nתזכו למצוות!\n\n{synagogue_name}'
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
 * Get email template from server with fallback to default
 */
async function getTemplate(templateKey: string): Promise<{ subject: string; html: string; text: string }> {
  try {
    const result = await apiGetEmailTemplate(templateKey);
    if (result.success && result.template) {
      return {
        subject: result.template.subject,
        html: result.template.html_template,
        text: result.template.text_template || ''
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch template '${templateKey}' from server:`, error);
  }

  // Fallback to default template
  return DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES.payment_reminder;
}

/**
 * Send a payment reminder email
 */
export async function sendPaymentReminder(
  recipientEmail: string,
  recipientName: string,
  message: string,
  synagogueName: string = 'בית הכנסת'
): Promise<SendEmailResult> {
  const template = await getTemplate('payment_reminder');

  const variables = {
    member_name: recipientName || 'מתפלל יקר',
    synagogue_name: synagogueName,
    custom_message: message.replace(/\n/g, '<br>')
  };

  const subject = processTemplate(template.subject, variables);
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
  const template = await getTemplate('scan_confirmation');

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
