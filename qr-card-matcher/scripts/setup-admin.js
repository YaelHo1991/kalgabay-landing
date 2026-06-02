/**
 * Setup Admin Script
 * Run this script once to add the admin email to Firebase
 *
 * Usage: node scripts/setup-admin.js
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDprTzQU5j1GjcHVb58gJA31bF8nPSK410",
  authDomain: "qr-card-matcher.firebaseapp.com",
  databaseURL: "https://qr-card-matcher-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qr-card-matcher",
  storageBucket: "qr-card-matcher.firebasestorage.app",
  messagingSenderId: "804321922176",
  appId: "1:804321922176:web:3eab516e01a37ad7ffaa65"
};

// Admin email to add
const ADMIN_EMAIL = "alberthouri@gmail.com";

async function setupAdmin() {
  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  console.log(`Adding admin email: ${ADMIN_EMAIL}`);

  try {
    // Add admin email
    await set(ref(db, `admin/config/adminEmails/${ADMIN_EMAIL.replace(/\./g, ',')}`), true);
    console.log('✅ Admin email added successfully!');

    // Initialize default landing content if not exists
    console.log('Setting up default landing content...');
    await set(ref(db, 'admin/landingContent'), {
      products: {
        mainPackage: {
          name: "קל גבאי - מערכת ניהול מכירות",
          description: "מערכת מקיפה לניהול מכירות עליות ומצוות בבית הכנסת",
          price: 499,
          currency: "₪",
          imageUrl: "",
          includes: [
            "אפליקציה לניהול מכירות",
            "סריקת QR לזיהוי מתפללים",
            "דוחות ומעקב תשלומים",
            "גיבוי בענן"
          ]
        },
        additionalProducts: []
      },
      video: {
        isAvailable: false,
        youtubeId: "",
        title: "סרטון הדרכה",
        description: ""
      },
      faq: [],
      contact: {
        email: "",
        phone: "",
        whatsapp: ""
      },
      lastUpdated: new Date().toISOString()
    });
    console.log('✅ Default landing content created!');

    // Initialize default message templates
    console.log('Setting up default message templates...');
    await set(ref(db, 'admin/messageTemplates'), {
      email: {
        paymentReminder: {
          id: "payment_reminder",
          name: "תזכורת תשלום",
          subject: "תזכורת תשלום - {synagogue}",
          body: "שלום {name},\n\nזוהי תזכורת בנוגע לתשלום בסך {amount} עבור רכישות בבית הכנסת {synagogue}.\n\nנשמח לקבל את התשלום בהקדם.\n\nבברכה,\n{synagogue}"
        },
        welcome: {
          id: "welcome",
          name: "ברוכים הבאים",
          subject: "ברוכים הבאים ל-{synagogue}",
          body: "שלום {name},\n\nברוכים הבאים למערכת קל גבאי של בית הכנסת {synagogue}!\n\nמעתה תוכל לנהל את הרכישות שלך בקלות.\n\nבברכה,\n{synagogue}"
        },
        custom: []
      },
      whatsapp: {
        paymentReminder: {
          id: "payment_reminder",
          name: "תזכורת תשלום",
          body: "שלום {name}, זוהי תזכורת בנוגע לתשלום בסך {amount} עבור {synagogue}. תודה!"
        },
        welcome: {
          id: "welcome",
          name: "ברוכים הבאים",
          body: "שלום {name}, ברוכים הבאים ל-{synagogue}!"
        },
        custom: []
      }
    });
    console.log('✅ Default message templates created!');

    console.log('\n🎉 Admin setup complete!');
    console.log(`Admin email: ${ADMIN_EMAIL}`);
    console.log('\nThe admin can now log in and see the "ניהול" button in the menu.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up admin:', error);
    process.exit(1);
  }
}

setupAdmin();
