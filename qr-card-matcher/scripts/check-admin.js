/**
 * Check Admin Script
 * Verifies the admin email is correctly stored in Firebase
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDprTzQU5j1GjcHVb58gJA31bF8nPSK410",
  authDomain: "qr-card-matcher.firebaseapp.com",
  databaseURL: "https://qr-card-matcher-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qr-card-matcher",
  storageBucket: "qr-card-matcher.firebasestorage.app",
  messagingSenderId: "804321922176",
  appId: "1:804321922176:web:3eab516e01a37ad7ffaa65"
};

async function checkAdmin() {
  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);

  console.log('\n--- Checking admin/config/adminEmails ---');
  const adminEmailsRef = ref(db, 'admin/config/adminEmails');
  const snapshot = await get(adminEmailsRef);

  if (snapshot.exists()) {
    console.log('Admin emails found:');
    const data = snapshot.val();
    console.log(JSON.stringify(data, null, 2));

    // Check for specific email
    const testEmail = 'alberthouri@gmail.com';
    const emailKey = testEmail.replace(/\./g, ',');
    console.log(`\nLooking for key: "${emailKey}"`);
    console.log(`Key exists: ${emailKey in data}`);
  } else {
    console.log('No admin emails found!');
  }

  process.exit(0);
}

checkAdmin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
