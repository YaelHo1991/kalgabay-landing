const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Hebrew first names
const firstNames = [
  'אברהם', 'יצחק', 'יעקב', 'משה', 'אהרון', 'דוד', 'שלמה', 'יוסף', 'בנימין', 'ראובן',
  'שמעון', 'לוי', 'יהודה', 'דן', 'נפתלי', 'גד', 'אשר', 'יששכר', 'זבולון', 'מנשה',
  'אפרים', 'שמואל', 'אליהו', 'ישעיהו', 'ירמיהו', 'יחזקאל', 'דניאל', 'עזרא', 'נחמיה', 'מרדכי',
  'חיים', 'מאיר', 'ברוך', 'צבי', 'אריה', 'יהושע', 'גדעון', 'שמשון', 'בועז', 'עובדיה',
  'יונה', 'מיכה', 'נחום', 'חבקוק', 'צפניה', 'חגי', 'זכריה', 'מלאכי', 'עמוס', 'הושע'
];

// Hebrew last names
const lastNames = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'אוחיון', 'עמר', 'חדד',
  'אזולאי', 'שמעון', 'גבאי', 'סבג', 'מלכה', 'בנימין', 'יוסף', 'דוד', 'שושן', 'אמסלם',
  'טל', 'רוזנברג', 'פרידמן', 'גולדשטיין', 'שוורץ', 'וייס', 'קליין', 'ברגמן', 'הופמן', 'זילברשטיין',
  'רבינוביץ', 'קפלן', 'שפירא', 'הורוביץ', 'גרינברג', 'פינקלשטיין', 'אדלר', 'בלום', 'קרמר', 'מילר',
  'זהבי', 'אלוני', 'שרון', 'ברק', 'גלעד', 'ארז', 'לביא', 'נתן', 'עוז', 'רם'
];

// Israeli phone prefixes
const phonePrefixes = ['050', '052', '053', '054', '055', '058'];

// Mitzvot names
const mitzvotNames = [
  'פתיחת ההיכל', 'הוצאת ספר תורה', 'הגבהה', 'גלילה', 'עליה ראשונה', 'עליה שנייה',
  'עליה שלישית', 'עליה רביעית', 'עליה חמישית', 'עליה שישית', 'עליה שביעית',
  'מפטיר', 'הפטרה', 'אחזקת בית הכנסת', 'פרוכת', 'כיסוי לבימה', 'מנורה',
  'שמן למאור', 'יין לקידוש', 'חלה', 'ספר תורה חדש', 'תיקון ספר תורה',
  'כתר לספר תורה', 'רימונים', 'מעיל לספר תורה', 'יד לספר תורה',
  'סידורים', 'חומשים', 'תהילים', 'מזוזות', 'ציצית', 'תפילין',
  'עירוב', 'מקווה', 'כיבוד לסעודה שלישית', 'קידוש שבת', 'הבדלה',
  'נר תמיד', 'שופר', 'לולב', 'אתרוג', 'סוכה', 'מגילה', 'נרות חנוכה',
  'משלוח מנות', 'מתנות לאביונים', 'קמחא דפסחא', 'ביקור חולים', 'הכנסת כלה'
];

function generatePhone() {
  const prefix = phonePrefixes[Math.floor(Math.random() * phonePrefixes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  return `${prefix}-${number.toString().slice(0, 3)}-${number.toString().slice(3)}`;
}

function generateEmail(firstName, lastName, index) {
  const domains = ['gmail.com', 'outlook.com', 'walla.co.il', 'yahoo.com', 'hotmail.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  // Transliterate Hebrew to English-like for email
  const translitMap = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
    'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ל': 'l', 'מ': 'm', 'נ': 'n',
    'ס': 's', 'ע': 'a', 'פ': 'p', 'צ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh',
    'ת': 't', 'ך': 'k', 'ם': 'm', 'ן': 'n', 'ף': 'p', 'ץ': 'ts'
  };

  const transliterate = (text) => {
    return text.split('').map(char => translitMap[char] || char).join('');
  };

  const emailFirst = transliterate(firstName).toLowerCase();
  const emailLast = transliterate(lastName).toLowerCase();
  return `${emailFirst}.${emailLast}${index}@${domain}`;
}

function generateMembers(count) {
  const members = [];
  const usedCombos = new Set();

  for (let i = 0; i < count; i++) {
    let firstName, lastName;
    let combo;

    // Ensure unique name combinations
    do {
      firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      combo = `${firstName}-${lastName}`;
    } while (usedCombos.has(combo));

    usedCombos.add(combo);

    members.push({
      'שם פרטי': firstName,
      'שם משפחה': lastName,
      'טלפון': generatePhone(),
      'אימייל': generateEmail(firstName, lastName, i + 1),
      'הערות': Math.random() > 0.7 ? 'חבר ותיק' : ''
    });
  }

  return members;
}

function generateMitzvot(count) {
  const mitzvot = [];
  const shuffled = [...mitzvotNames].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const basePrice = [18, 36, 54, 72, 100, 180, 260, 360, 500, 1000, 1800];
    const price = basePrice[Math.floor(Math.random() * basePrice.length)];

    mitzvot.push({
      'שם המצווה': shuffled[i],
      'מחיר': price,
      'הערות': Math.random() > 0.6 ? 'מצווה מיוחדת' : '',
      'זמינה בחגים': Math.random() > 0.3 ? 'כן' : 'לא',
      'חגים בלבד': Math.random() > 0.8 ? 'כן' : 'לא'
    });
  }

  return mitzvot;
}

function createExcelFile(data, filename) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'נתונים');

  // Set column widths
  const colWidths = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length * 2, 15) }));
  worksheet['!cols'] = colWidths;

  const filepath = path.join(__dirname, '..', 'test-data', filename);
  XLSX.writeFile(workbook, filepath);
  console.log(`Created: ${filepath}`);
}

// Generate test data files
const testDataDir = path.join(__dirname, '..', 'test-data');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Create 3 member files with different sizes
const memberCounts = [25, 35, 45];
memberCounts.forEach((count, index) => {
  const members = generateMembers(count);
  createExcelFile(members, `members-${index + 1}-${count}.xlsx`);
});

// Create 1 mitzvot file
const mitzvot = generateMitzvot(40);
createExcelFile(mitzvot, 'mitzvot-40.xlsx');

console.log('\nAll test data files created successfully!');
