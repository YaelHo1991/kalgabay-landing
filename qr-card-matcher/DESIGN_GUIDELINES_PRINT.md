# הנחיות עיצוב - דף הדפסת מדבקות (PrintPage)

## מיקום הקובץ
```
src/components/dashboard/PrintPage.tsx
src/components/dashboard/PrintPage.css
```

## עקרונות עיצוב כלליים

### פלטת צבעים (שני צבעים בלבד!)
```css
/* כחול - צבע ראשי */
--blue-50: #EFF6FF;    /* רקע בהיר */
--blue-100: #DBEAFE;   /* borders, tags */
--blue-500: #3B82F6;   /* כפתורים, אייקונים */
--blue-600: #2563EB;   /* hover, פעולות */
--blue-700: #1D4ED8;   /* טקסט מודגש */

/* צהוב/כתום - התראות בלבד */
--yellow-50: #FFFBEB;   /* רקע התראה */
--yellow-100: #FEF3C7;  /* border התראה */
--yellow-400: #FBBF24;  /* header התראה */
--yellow-500: #F59E0B;  /* אייקון התראה */
--yellow-600: #D97706;  /* טקסט התראה */

/* אפור - טקסט ורקעים */
--gray-50 עד --gray-900
```

### עקרונות עיצוב
1. **RTL מלא** - כל הטקסט בעברית, מימין לשמאל
2. **border-radius גדול** - 12px-20px לכרטיסים, 8px-10px לכפתורים
3. **צללים עדינים** - `box-shadow: 0 2px 12px rgba(0,0,0,0.04)`
4. **gradients עדינים** - `linear-gradient(135deg, var(--blue-50) 0%, white 100%)`
5. **פונט משקל** - 700 לכותרות, 600 למודגש, 500 לרגיל

---

## מבנה הדף - PrintPage

### 1. Page Header
```tsx
<header className="print-page-header">
  <div className="print-title-section">
    <div className="print-icon">
      <PrintIcon />
    </div>
    <div>
      <h1 className="print-title">הדפסת מדבקות</h1>
      <p className="print-subtitle">הדפסת מדבקות למצוות השבוע</p>
    </div>
  </div>
  <div className="print-actions">
    <button className="btn btn-outline">
      <SettingsIcon />
      הגדרות הדפסה
    </button>
    <button className="btn btn-primary">
      <PrintIcon />
      הדפס הכל
    </button>
  </div>
</header>
```

### 2. תצוגת סטטוס (סיכום מהיר)
```tsx
<div className="print-status-bar">
  <div className="status-item">
    <span className="status-value">12</span>
    <span className="status-label">מדבקות להדפסה</span>
  </div>
  <div className="status-item">
    <span className="status-value">3</span>
    <span className="status-label">דפים</span>
  </div>
  <div className="status-item">
    <span className="status-value">₪4,520</span>
    <span className="status-label">סה"כ סכום</span>
  </div>
</div>
```

### 3. Content Layout (כמו הדאשבורד)
```tsx
<div className="print-content-layout">
  {/* Main Area - רשימת מדבקות */}
  <div className="print-main-area">
    {/* בורר שבוע/פרשה */}
    <div className="week-selector">...</div>

    {/* רשימת מדבקות */}
    <div className="labels-list">
      {labels.map(label => (
        <LabelCard key={label.id} {...label} />
      ))}
    </div>
  </div>

  {/* Sidebar - הגדרות והתצוגה המקדימה */}
  <div className="print-sidebar">
    <PrintSettingsWidget />
    <PrintPreviewWidget />
  </div>
</div>
```

---

## קומפוננטות

### LabelCard - כרטיס מדבקה בודדת
```tsx
<div className="label-card">
  <div className="label-checkbox">
    <input type="checkbox" checked={selected} onChange={...} />
  </div>
  <div className="label-content">
    <div className="label-member">
      <div className="label-avatar">א.כ</div>
      <div className="label-details">
        <div className="label-name">אברהם כהן</div>
        <div className="label-phone">054-1234567</div>
      </div>
    </div>
    <div className="label-mitzva">
      <span className="label-mitzva-tag">פתיחה</span>
      <span className="label-price">₪180</span>
    </div>
  </div>
  <div className="label-actions">
    <button className="label-action-btn" title="עריכה">
      <EditIcon />
    </button>
    <button className="label-action-btn" title="מחק">
      <DeleteIcon />
    </button>
  </div>
</div>
```

### PrintSettingsWidget - הגדרות הדפסה
```tsx
<div className="settings-widget">
  <h3 className="widget-title">
    <SettingsIcon />
    הגדרות מדבקות
  </h3>

  {/* גודל מדבקה */}
  <div className="setting-group">
    <label>גודל מדבקה:</label>
    <select className="setting-select">
      <option>2 x 4 אינץ'</option>
      <option>1.5 x 3 אינץ'</option>
      <option>מותאם אישית</option>
    </select>
  </div>

  {/* מידע להצגה */}
  <div className="setting-group">
    <label>מידע להצגה:</label>
    <div className="checkbox-group">
      <label><input type="checkbox" checked /> שם מלא</label>
      <label><input type="checkbox" checked /> מצווה</label>
      <label><input type="checkbox" checked /> מחיר</label>
      <label><input type="checkbox" /> טלפון</label>
      <label><input type="checkbox" /> QR Code</label>
    </div>
  </div>

  {/* סגנון */}
  <div className="setting-group">
    <label>סגנון:</label>
    <div className="style-options">
      <button className="style-btn active">קלאסי</button>
      <button className="style-btn">מודרני</button>
      <button className="style-btn">מינימלי</button>
    </div>
  </div>
</div>
```

### PrintPreviewWidget - תצוגה מקדימה
```tsx
<div className="preview-widget">
  <h3 className="widget-title">
    <PreviewIcon />
    תצוגה מקדימה
  </h3>

  <div className="preview-container">
    {/* מדבקה לדוגמה */}
    <div className="preview-label">
      <div className="preview-label-header">פתיחה</div>
      <div className="preview-label-name">אברהם כהן</div>
      <div className="preview-label-price">₪180</div>
      <div className="preview-label-qr">
        {showQR && <QRCode />}
      </div>
    </div>
  </div>

  <button className="btn btn-outline btn-full">
    <ExpandIcon />
    תצוגה מקדימה מלאה
  </button>
</div>
```

---

## CSS Patterns

### Widget Container (כמו בדאשבורד)
```css
.settings-widget,
.preview-widget {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  border: 1px solid var(--blue-100);
}

.widget-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--blue-700);
  margin-bottom: 20px;
}

.widget-title svg {
  width: 22px;
  height: 22px;
  fill: var(--blue-500);
}
```

### Label Card
```css
.label-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--blue-100);
  transition: all 0.2s;
}

.label-card:hover {
  border-color: var(--blue-300);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.1);
}

.label-card.selected {
  background: var(--blue-50);
  border-color: var(--blue-400);
}

.label-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--blue-100), var(--blue-200));
  color: var(--blue-700);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.9rem;
}

.label-mitzva-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  background: var(--blue-100);
  color: var(--blue-700);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
}
```

### Buttons
```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.btn-primary {
  background: linear-gradient(135deg, var(--blue-500), var(--blue-600));
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--blue-600), var(--blue-700));
  transform: translateY(-1px);
}

.btn-outline {
  background: white;
  border: 1px solid var(--gray-200);
  color: var(--gray-600);
}

.btn-outline:hover {
  background: var(--gray-50);
  border-color: var(--gray-300);
}
```

### Settings Elements
```css
.setting-group {
  margin-bottom: 20px;
}

.setting-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--gray-700);
  margin-bottom: 8px;
}

.setting-select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  font-size: 0.9rem;
  background: white;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
  cursor: pointer;
}

.style-options {
  display: flex;
  gap: 8px;
}

.style-btn {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--gray-200);
  border-radius: 10px;
  background: white;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.style-btn.active {
  background: var(--blue-500);
  color: white;
  border-color: var(--blue-500);
}
```

### Preview
```css
.preview-container {
  background: var(--gray-100);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  margin-bottom: 16px;
}

.preview-label {
  width: 180px;
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  text-align: center;
  border: 1px dashed var(--gray-300);
}

.preview-label-header {
  font-weight: 700;
  color: var(--blue-700);
  font-size: 1.1rem;
  margin-bottom: 8px;
}

.preview-label-name {
  font-size: 0.9rem;
  color: var(--gray-800);
  margin-bottom: 4px;
}

.preview-label-price {
  font-weight: 700;
  color: var(--blue-600);
  font-size: 1rem;
}
```

---

## פונקציונליות נדרשת

### 1. בחירת מדבקות
- [ ] בחירה בודדת / מרובה
- [ ] בחר הכל / נקה הכל
- [ ] סינון לפי: מצווה, סטטוס תשלום, שם

### 2. הגדרות הדפסה
- [ ] גודל מדבקה (מספר אפשרויות)
- [ ] מידע להצגה (checkboxes)
- [ ] סגנון עיצוב (3 סגנונות)
- [ ] כיוון טקסט (RTL/LTR)
- [ ] הוספת QR Code (אופציונלי)

### 3. תצוגה מקדימה
- [ ] תצוגה מקדימה קטנה בסיידבר
- [ ] פתיחת תצוגה מלאה (modal/page)
- [ ] ניווט בין דפים

### 4. הדפסה
- [ ] הדפסה ישירה
- [ ] ייצוא ל-PDF
- [ ] שמירת הגדרות (localStorage)

---

## קבצים להתייחסות
- `DashboardDesktop.css` - CSS variables ועקרונות
- `ArchivePage.tsx/css` - layout דומה
- `SidebarWidgets.tsx` - widgets pattern
- `PurchasesTable.tsx` - table/list pattern

## הערות חשובות
1. **לא להשתמש בצבעים נוספים** - רק כחול וצהוב
2. **שמור על RTL** - כל הטקסט מימין לשמאל
3. **Consistent spacing** - gap: 8px/12px/16px/20px/24px
4. **Hover states** - תמיד להוסיף transform או שינוי צבע
5. **Mobile responsive** - להוסיף media queries ל-768px ו-1200px
