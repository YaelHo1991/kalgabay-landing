import * as XLSX from 'xlsx';

// Member data structure for import/export
export interface MemberExcelData {
  'שם פרטי': string;
  'שם משפחה': string;
  'טלפון'?: string;
  'אימייל'?: string;
  'הערות'?: string;
}

// Mitzva data structure for import/export
export interface MitzvaExcelData {
  'שם המצווה': string;
  'מחיר'?: number;
  'הערות'?: string;
  'זמינה בחגים'?: string;
  'חגים בלבד'?: string;
}

// Export members to Excel
export async function exportMembersToExcel(members: Array<{
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}>): Promise<void> {
  const data: MemberExcelData[] = members.map(m => ({
    'שם פרטי': m.first_name,
    'שם משפחה': m.last_name,
    'טלפון': m.phone || '',
    'אימייל': m.email || '',
    'הערות': m.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'מתפללים');

  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // שם פרטי
    { wch: 15 }, // שם משפחה
    { wch: 15 }, // טלפון
    { wch: 25 }, // אימייל
    { wch: 20 }, // הערות
  ];

  const fileName = `מתפללים_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// Export mitzvot to Excel
export async function exportMitzvotToExcel(mitzvot: Array<{
  name: string;
  price?: number;
  notes?: string | null;
  available_on_holidays?: number;
  holidays_only?: number;
}>): Promise<void> {
  const data: MitzvaExcelData[] = mitzvot.map(m => ({
    'שם המצווה': m.name,
    'מחיר': m.price || 0,
    'הערות': m.notes || '',
    'זמינה בחגים': m.available_on_holidays === 1 ? 'כן' : 'לא',
    'חגים בלבד': m.holidays_only === 1 ? 'כן' : 'לא',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'מצוות');

  // Set column widths
  worksheet['!cols'] = [
    { wch: 20 }, // שם המצווה
    { wch: 10 }, // מחיר
    { wch: 20 }, // הערות
    { wch: 12 }, // זמינה בחגים
    { wch: 12 }, // חגים בלבד
  ];

  const fileName = `מצוות_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

// Parse members from Excel file
export async function importMembersFromExcel(file: File): Promise<Array<{
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  notes?: string;
}>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<MemberExcelData>(worksheet);

        // Map to expected format
        const members = jsonData
          .filter(row => row['שם פרטי'] && row['שם משפחה']) // Only rows with required fields
          .map(row => ({
            firstName: String(row['שם פרטי'] || '').trim(),
            lastName: String(row['שם משפחה'] || '').trim(),
            phone: row['טלפון'] ? String(row['טלפון']).trim() : undefined,
            email: row['אימייל'] ? String(row['אימייל']).trim() : undefined,
            notes: row['הערות'] ? String(row['הערות']).trim() : undefined,
          }));

        resolve(members);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Parse mitzvot from Excel file
export async function importMitzvotFromExcel(file: File): Promise<Array<{
  name: string;
  price?: number;
  notes?: string;
  availableOnHolidays: boolean;
  holidaysOnly: boolean;
}>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<MitzvaExcelData>(worksheet);

        // Map to expected format
        const mitzvot = jsonData
          .filter(row => row['שם המצווה']) // Only rows with required fields
          .map(row => ({
            name: String(row['שם המצווה'] || '').trim(),
            price: row['מחיר'] ? Number(row['מחיר']) : 0,
            notes: row['הערות'] ? String(row['הערות']).trim() : undefined,
            availableOnHolidays: row['זמינה בחגים'] === 'כן',
            holidaysOnly: row['חגים בלבד'] === 'כן',
          }));

        resolve(mitzvot);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
