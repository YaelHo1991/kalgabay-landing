# הגדרות Hostinger - YanShouf

## פרטי השרת

| פרט | ערך |
|-----|-----|
| **אתר** | https://yanshouf.com |
| **פאנל ניהול** | https://yanshouf.com/admin/ |
| **API** | https://yanshouf.com/api/ |
| **ספק אחסון** | Hostinger |

---

## מבנה הקבצים בשרת

```
public_html/
├── index.php              # דף נחיתה ראשי
├── config.php             # הגדרות כלליות + חיבור DB
├── api/
│   ├── auth.php           # התחברות משתמשים (license validation)
│   ├── sync.php           # סנכרון נתונים מהאפליקציה
│   ├── email-templates.php # API לתבניות מייל
│   └── ...
├── admin/
│   ├── index.php          # לוח בקרה
│   ├── users.php          # ניהול משתמשים/רישיונות
│   ├── email-templates.php # עריכת תבניות מייל
│   ├── settings.php       # הגדרות האתר
│   ├── products.php       # מוצרים
│   ├── features.php       # תכונות
│   ├── faq.php            # שאלות נפוצות
│   ├── downloads.php      # קבצים להורדה
│   ├── videos.php         # סרטונים
│   └── includes/
│       ├── header.php     # תפריט צדדי
│       └── footer.php
└── assets/
    └── ...
```

---

## מסד נתונים (MySQL)

### טבלאות עיקריות:

| טבלה | תיאור |
|------|-------|
| `users` | משתמשים/רישיונות של האפליקציה |
| `email_templates` | תבניות מייל (scan_confirmation, payment_reminder) |
| `settings` | הגדרות האתר |
| `products` | מוצרים בדף הנחיתה |
| `features` | תכונות בדף הנחיתה |
| `faq` | שאלות נפוצות |
| `downloads` | קבצים להורדה |
| `videos` | סרטוני הדרכה |

---

## תבניות מייל

### משתנים זמינים:

| משתנה | תיאור |
|-------|-------|
| `{member_name}` | שם המתפלל |
| `{member_first_name}` | שם פרטי |
| `{member_last_name}` | שם משפחה |
| `{synagogue_name}` | שם בית הכנסת |
| `{mitzvot_list}` | רשימת מצוות (טבלה) |
| `{mitzvot_text}` | רשימת מצוות (טקסט) |
| `{total_amount}` | סכום כולל |
| `{unpaid_list}` | מצוות לא שולמו (טבלה) |
| `{unpaid_text}` | מצוות לא שולמו (טקסט) |
| `{total_unpaid}` | סכום לתשלום |
| `{custom_message}` | הודעה אישית |
| `{parasha_name}` | שם הפרשה |
| `{shabbat_date}` | תאריך השבת |
| `{date}` | תאריך נוכחי |

---

## API Endpoints

### אימות משתמש
```
POST /api/auth.php
Body: { email, password }
Response: { success, user, token }
```

### סנכרון נתונים
```
POST /api/sync.php
Headers: Authorization: Bearer <token>
Body: { members, mitzvot, ... }
```

### תבניות מייל
```
GET /api/email-templates.php?key=<template_key>
Response: { subject, body_html, body_text, variables }
```

---

## העלאת קבצים לשרת

### דרך Hostinger File Manager:
1. כניסה ל-Hostinger Panel
2. Files → File Manager
3. נווט ל-public_html
4. העלה/ערוך קבצים

### דרך FTP:
- Host: ftp.yanshouf.com (או כפי שמוגדר ב-Hostinger)
- Username: מוגדר ב-Hostinger
- Password: מוגדר ב-Hostinger
- Port: 21

---

## חשוב לזכור

1. **אין Firebase** - הכל עובר דרך Hostinger/YanShouf
2. **Gmail OAuth** - מוגדר ב-Google Cloud Console עם redirect URIs:
   - `http://localhost:3850/oauth/callback`
   - `http://localhost:3851/oauth/callback` (עד 3859 כגיבוי)
3. **רישיונות** - מנוהלים דרך `/admin/users.php`
4. **תבניות מייל** - מנוהלות דרך `/admin/email-templates.php`

---

## קבצים מקומיים לעדכן בשרת

כשמעדכנים את אתר האדמין, להעלות מ:
```
yanshouf-website/
├── admin/
├── api/
├── config.php
└── index.php
```

---

*עודכן: 31/05/2026*
