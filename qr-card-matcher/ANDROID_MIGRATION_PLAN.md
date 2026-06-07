GM# תוכנית הוספת תמיכה באנדרואיד - KalGabay

## סקירה כללית

הפרויקט כבר משתמש ב-**Tauri 2.0** שתומך באנדרואיד באופן מובנה.
המטרה: להוסיף תמיכה באנדרואיד **מבלי לפגוע בקוד הדסקטופ הקיים**.

---

## שלב 1: הכנת מבנה התיקיות (בטוח - לא משפיע על הקוד הקיים)

### מבנה מומלץ:

```
qr-card-matcher/
├── src/
│   ├── components/
│   │   ├── shared/              # 🆕 קומפוננטות משותפות (יועברו מהקיים)
│   │   │   ├── QRScanner.tsx
│   │   │   ├── QRGenerator.tsx
│   │   │   └── ...
│   │   ├── desktop/             # 🆕 ספציפי לדסקטופ (יועברו מהקיים)
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TitleBar.tsx
│   │   │   └── dashboard/
│   │   │       ├── DashboardDesktopView.tsx
│   │   │       └── ...
│   │   └── mobile/              # 🆕 ספציפי למובייל (חדש)
│   │       ├── MobileDashboard.tsx
│   │       ├── BottomNav.tsx
│   │       └── screens/
│   │           ├── HomeScreen.tsx
│   │           ├── MembersScreen.tsx
│   │           └── ...
│   ├── services/                # קיים - משותף לשני הפלטפורמות
│   ├── hooks/                   # קיים - משותף
│   ├── platform/                # 🆕 הגדרות ספציפיות לפלטפורמה
│   │   ├── index.ts             # זיהוי פלטפורמה
│   │   ├── desktop/
│   │   │   └── printer.ts       # הדפסה בדסקטופ
│   │   └── mobile/
│   │       ├── printer.ts       # הדפסה באנדרואיד (Bluetooth/WiFi)
│   │       └── camera.ts        # גישה למצלמה באנדרואיד
│   ├── App.tsx                  # יעודכן לזהות פלטפורמה
│   └── App.mobile.tsx           # 🆕 Entry point למובייל
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # קיים
│   │   ├── main.rs              # קיים - לדסקטופ
│   │   └── mobile.rs            # 🆕 לאנדרואיד
│   ├── gen/
│   │   └── android/             # 🆕 יווצר אוטומטית
│   ├── Cargo.toml               # כבר מוגדר עם תנאים לפלטפורמה
│   └── tauri.conf.json          # יעודכן להוסיף הגדרות אנדרואיד
└── prototypes/
    └── mobile/
        └── android-v1.html      # הפרוטוטייפ שיצרנו
```

---

## שלב 2: הגדרת Tauri לאנדרואיד

### 2.1 התקנת דרישות מקדימות (במחשב הפיתוח)

```bash
# התקנת Android Studio
# הורדה מ: https://developer.android.com/studio

# הגדרת משתני סביבה (Windows)
# ANDROID_HOME = C:\Users\<user>\AppData\Local\Android\Sdk
# JAVA_HOME = C:\Program Files\Android\Android Studio\jbr

# התקנת NDK דרך Android Studio:
# Tools > SDK Manager > SDK Tools > NDK (Side by side)
```

### 2.2 אתחול תמיכה באנדרואיד

```bash
# בתיקיית הפרויקט
cd qr-card-matcher
npm run tauri android init
```

**מה זה עושה:**
- יוצר תיקיית `src-tauri/gen/android/` עם פרויקט Android
- מוסיף קבצי הגדרות לאנדרואיד
- **לא משנה שום דבר בקוד הקיים!**

### 2.3 עדכון tauri.conf.json

```json
{
  "$schema": "https://schema.tauri.app/config/2.0.0",
  "productName": "KalGabay",
  "version": "1.0.0",
  "identifier": "com.kalgabay.app",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://127.0.0.1:8888",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "קלגבאי - KalGabay",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "decorations": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/icon.ico",
      "icons/icon.png",
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png"
    ],
    "android": {
      "minSdkVersion": 24
    },
    "windows": {
      "nsis": {
        "headerImage": "icons/installer-header.bmp",
        "sidebarImage": "icons/installer-sidebar.bmp"
      }
    }
  },
  "plugins": {
    "sql": {
      "preload": [
        "sqlite:qrcards.db"
      ]
    }
  }
}
```

---

## שלב 3: יצירת מנגנון זיהוי פלטפורמה

### 3.1 קובץ `src/platform/index.ts`

```typescript
import { platform } from '@tauri-apps/plugin-os';

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios';

let currentPlatform: Platform | null = null;

export async function getPlatform(): Promise<Platform> {
  if (currentPlatform) return currentPlatform;

  try {
    currentPlatform = await platform() as Platform;
  } catch {
    // Fallback for web/dev
    currentPlatform = 'windows';
  }

  return currentPlatform;
}

export function isMobile(): boolean {
  return currentPlatform === 'android' || currentPlatform === 'ios';
}

export function isDesktop(): boolean {
  return !isMobile();
}
```

### 3.2 עדכון `src/App.tsx`

```typescript
import { useState, useEffect } from 'react';
import { getPlatform, isMobile } from './platform';

// קומפוננטות
import DesktopApp from './components/desktop/DesktopApp';
import MobileApp from './components/mobile/MobileApp';

export default function App() {
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    getPlatform().then(p => setPlatform(p));
  }, []);

  if (!platform) {
    return <div className="loading">טוען...</div>;
  }

  // הפניה לממשק המתאים
  return isMobile() ? <MobileApp /> : <DesktopApp />;
}
```

---

## שלב 4: ארגון מחדש של הקומפוננטות

### 4.1 קומפוננטות משותפות (shared)
קומפוננטות שעובדות בשניהם ללא שינוי:

| קובץ | תפקיד |
|------|-------|
| `QRScanner.tsx` | סריקת QR (אותו קוד, רק גודל שונה) |
| `QRGenerator.tsx` | יצירת QR |
| `LoginPage.tsx` | התחברות (עם התאמות CSS) |
| `WeekDisplay.tsx` | תצוגת שבוע |

### 4.2 קומפוננטות דסקטופ בלבד

| קובץ | סיבה |
|------|------|
| `TitleBar.tsx` | Title bar מותאם אישית - לא רלוונטי לאנדרואיד |
| `DashboardDesktopView.tsx` | פריסת דסקטופ |
| `PrintPreviewModal.tsx` | תצוגה מקדימה להדפסה - שונה באנדרואיד |

### 4.3 קומפוננטות מובייל חדשות

| קובץ | תפקיד |
|------|-------|
| `MobileApp.tsx` | Entry point למובייל |
| `BottomNav.tsx` | ניווט תחתון |
| `HomeScreen.tsx` | מסך בית |
| `MembersScreen.tsx` | רשימת מתפללים |
| `MitzvotScreen.tsx` | רשימת מצוות |
| `PrintScreen.tsx` | הדפסת תוויות |
| `ArchiveScreen.tsx` | ארכיון |
| `ScannerSheet.tsx` | מודל סריקה (bottom sheet) |

---

## שלב 5: התאמת Services לפלטפורמה

### 5.1 הדפסה - `src/platform/printer.ts`

```typescript
import { isMobile } from './index';

// Desktop printer
import { print as desktopPrint } from 'tauri-plugin-printer-v2';

// Mobile printer (Bluetooth/WiFi)
// TODO: להוסיף פלאגין להדפסה באנדרואיד

export async function printLabels(html: string): Promise<void> {
  if (isMobile()) {
    // אנדרואיד - הדפסה דרך Bluetooth או שיתוף
    await mobilePrint(html);
  } else {
    // דסקטופ - הדפסה רגילה
    await desktopPrint(html);
  }
}

async function mobilePrint(html: string): Promise<void> {
  // אפשרויות:
  // 1. שימוש ב-Android Print Framework
  // 2. חיבור Bluetooth למדפסת תרמית
  // 3. שמירה כ-PDF ושיתוף

  // TODO: לממש בהתאם לדרישות
}
```

### 5.2 מצלמה - `src/platform/camera.ts`

```typescript
import { isMobile } from './index';

export async function openCamera(): Promise<MediaStream | null> {
  if (isMobile()) {
    // באנדרואיד - שימוש ב-native camera API
    // TODO: להוסיף tauri-plugin-camera או דומה
  } else {
    // בדסקטופ - שימוש ב-WebRTC (כמו עכשיו)
    return navigator.mediaDevices.getUserMedia({ video: true });
  }
}
```

---

## שלב 6: פקודות Build

### package.json - סקריפטים חדשים

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",

    "// Desktop": "",
    "dev:desktop": "npm run tauri dev",
    "build:desktop": "npm run tauri build",

    "// Android": "",
    "dev:android": "npm run tauri android dev",
    "build:android": "npm run tauri android build",
    "build:android:apk": "npm run tauri android build --apk",
    "build:android:aab": "npm run tauri android build --aab"
  }
}
```

---

## שלב 7: סדר עבודה מומלץ

### שלב א' - הכנה (לא משפיע על דסקטופ) ✅ הושלם!
1. [x] יצירת תיקיות `shared`, `desktop`, `mobile` ב-components
2. [x] יצירת תיקיית `platform`
3. [x] כתיבת קובץ זיהוי פלטפורמה (`src/platform/index.ts`)
4. [x] יצירת index files ל-shared ו-desktop
5. [x] יצירת קומפוננטות בסיס למובייל (`MobileApp.tsx`, `BottomNav.tsx`)
6. [x] הוספת סקריפטים ל-package.json
7. [x] הוספת `@tauri-apps/plugin-os` ל-dependencies
8. [x] הוספת `tauri-plugin-os` ל-Cargo.toml
9. [x] עדכון lib.rs עם הפלאגין
10. [x] **בדיקה שהדסקטופ עדיין עובד!** - Build עובר בהצלחה!

### שלב ב' - הגדרת Android (הסשן הבא)
1. [ ] התקנת Android Studio ו-NDK
2. [ ] הגדרת משתני סביבה (ANDROID_HOME, JAVA_HOME)
3. [ ] הרצת `npm run android:init`
4. [ ] בדיקה באמולטור

### שלב ג' - פיתוח קומפוננטות מובייל
5. [ ] מילוי תוכן אמיתי ל-MobileApp.tsx
6. [ ] יצירת מסכים אמיתיים (HomeScreen, MembersScreen, וכו')
7. [ ] התאמת CSS למובייל
8. [ ] שימוש ב-shared components

### שלב ד' - פיצ'רים ספציפיים
9. [ ] הדפסה באנדרואיד (Bluetooth/Share)
10. [ ] סריקת QR native
11. [ ] Push notifications (אופציונלי)

---

## אזהרות חשובות ⚠️

### 1. לא לשנות קבצים קיימים בהתחלה
- תמיד לבנות את הדסקטופ ולבדוק שעובד אחרי כל שינוי
- `npm run build:desktop`

### 2. Cargo.toml - כבר מוגדר נכון
הקובץ כבר מכיל:
```toml
[target.'cfg(not(target_os = "android"))'.dependencies]
tauri-plugin-printer-v2 = "0.2"
```
זה אומר שפלאגין ההדפסה לא ייטען באנדרואיד (שם הוא לא נתמך).

### 3. גיבוי לפני שינויים גדולים
```bash
git checkout -b feature/android-support
```

---

## משאבים

- [Tauri Mobile Guide](https://v2.tauri.app/start/prerequisites/)
- [Tauri Android Setup](https://v2.tauri.app/start/prerequisites/#android)
- [Tauri Plugins](https://v2.tauri.app/plugin/)

---

## סיכום

התוכנית מאפשרת:
1. ✅ שמירה על קוד דסקטופ קיים
2. ✅ שיתוף לוגיקה (services, hooks, types)
3. ✅ UI נפרד לכל פלטפורמה
4. ✅ הגדרות ספציפיות (מדפסת, מצלמה)
5. ✅ build נפרד לכל פלטפורמה

**הקוד של הדסקטופ לא ייפגע כי:**
- לא משנים קבצים קיימים, רק מוסיפים
- כל הקוד החדש מופרד לתיקיות נפרדות
- זיהוי פלטפורמה קורה ב-runtime
- Build scripts נפרדים
