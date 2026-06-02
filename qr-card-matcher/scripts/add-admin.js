/**
 * Add Admin Script
 * Adds an additional admin email to Firebase
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

// New admin email to add
const NEW_ADMIN_EMAIL = "ayelho@gmail.com";

async function addAdmin() {
  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  console.log(`Adding admin email: ${NEW_ADMIN_EMAIL}`);

  try {
    // Add admin email (replace . with , for Firebase key)
    const emailKey = NEW_ADMIN_EMAIL.replace(/\./g, ',');
    await set(ref(db, `admin/config/adminEmails/${emailKey}`), true);
    console.log('✅ Admin email added successfully!');
    console.log(`Email: ${NEW_ADMIN_EMAIL}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding admin:', error);
    process.exit(1);
  }
}

addAdmin();
