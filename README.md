# KalGabay Landing Page

דף נחיתה לאפליקציית KalGabay - ניהול בית הכנסת בקלות.

## 🚀 התחלה מהירה

### צפייה מקומית
פשוט פתחו את `index.html` בדפדפן.

### העלאה ל-GitHub Pages (חינם!)
1. צרו repository חדש ב-GitHub
2. העלו את כל הקבצים בתיקייה זו
3. לכו ל-Settings > Pages
4. בחרו Source: main branch
5. האתר יהיה זמין ב: `https://USERNAME.github.io/REPO-NAME`

---

## 📝 עדכון תוכן

כל התוכן נמצא בקובץ **`config.js`** - זה הקובץ היחיד שצריך לערוך!

### עדכון מחירים
```javascript
products: {
    mainPackage: {
        price: 499,  // <-- שנו כאן
        // ...
    },
    additionalProducts: [
        {
            name: "מעטפות נוספות",
            price: 79,  // <-- שנו כאן
            // ...
        }
    ]
}
```

### הוספת קישור לחנות Google Play
```javascript
appLinks: {
    isAvailable: true,  // <-- שנו ל-true
    googlePlay: "https://play.google.com/store/apps/details?id=YOUR_APP_ID",
    // ...
}
```

### הוספת סרטון YouTube
```javascript
video: {
    isAvailable: true,  // <-- שנו ל-true
    youtubeId: "ABC123XYZ",  // <-- הכניסו את הID של הסרטון
    // ...
}
```
> 💡 איך למצוא YouTube ID: בכתובת `https://youtube.com/watch?v=ABC123XYZ`
> ה-ID הוא החלק אחרי `v=`

### עדכון פרטי קשר
```javascript
contact: {
    email: "your@email.com",
    phone: "+972-50-123-4567",
    whatsapp: "+972501234567"
}
```

---

## 🖼️ תמונות

שמרו תמונות בתיקיית `images/`:

| קובץ | תיאור | גודל מומלץ |
|------|--------|------------|
| `logo.png` | הלוגו | 200x200px |
| `app-mockup.png` | תמונת האפליקציה | 400x600px |
| `main-package.png` | תמונת החבילה | 300x250px |
| `envelopes.png` | תמונת מעטפות | 120x120px |
| `cards.png` | תמונת כרטיסים | 120x120px |
| `stickers.png` | תמונת מדבקות | 120x120px |
| `support.png` | אייקון תמיכה | 120x120px |

> 📌 אם תמונה חסרה, מוצגת תמונת ברירת מחדל אוטומטית.

---

## 📁 מבנה הקבצים

```
kalgabay-landing/
├── index.html      # דף הנחיתה הראשי
├── styles.css      # עיצוב (אין צורך לשנות)
├── main.js         # לוגיקה (אין צורך לשנות)
├── config.js       # ⭐ כל התוכן - עורכים כאן!
├── images/         # תיקיית תמונות
│   ├── logo.png
│   ├── app-mockup.png
│   └── ...
└── README.md       # הקובץ הזה
```

---

## 🎨 צבעים

הצבעים מבוססים על האפליקציה:
- **זהב/בז'**: `#C9A86C` (צבע ראשי)
- **חום כהה**: `#8B7355` (ניווט)
- **חום בינוני**: `#6B5344`
- **חום עמוק**: `#5D4E37`

---

## ✅ רשימת בדיקה לפני העלאה

- [ ] עדכנתי מחירים אמיתיים ב-config.js
- [ ] הוספתי תמונות אמיתיות לתיקיית images/
- [ ] עדכנתי פרטי קשר (אימייל, טלפון, וואטסאפ)
- [ ] בדקתי שהדף נראה טוב במובייל
- [ ] כשהאפליקציה תהיה בחנות - אעדכן את הקישור

---

## ❓ שאלות נפוצות

**ש: איך מוסיפים סרטון?**
ת: העלו סרטון ל-YouTube, העתיקו את ה-ID, ועדכנו ב-config.js

**ש: למה ה-QR לא מופיע?**
ת: QR נוצר רק כשיש קישור תקין (כשהאפליקציה בחנות / סרטון קיים)

**ש: איך משנים צבעים?**
ת: ערכו את המשתנים ב-config.js תחת `colors`, או ערכו styles.css

---

## 📞 עזרה

יש שאלות? פנו ל: contact@kalgabay.com
