/**
 * Create Admin User Script
 * Creates a Firebase Auth user for the admin
 *
 * Usage: node scripts/create-admin-user.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDprTzQU5j1GjcHVb58gJA31bF8nPSK410",
  authDomain: "qr-card-matcher.firebaseapp.com",
  databaseURL: "https://qr-card-matcher-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qr-card-matcher",
  storageBucket: "qr-card-matcher.firebasestorage.app",
  messagingSenderId: "804321922176",
  appId: "1:804321922176:web:3eab516e01a37ad7ffaa65"
};

// Admin credentials
const ADMIN_EMAIL = "alberthouri@gmail.com";
const ADMIN_PASSWORD = "KalGabay2024!";

async function createAdminUser() {
  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  console.log(`Creating user: ${ADMIN_EMAIL}`);

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ Admin user created successfully!');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log(`UID: ${userCredential.user.uid}`);
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('ℹ️ User already exists with this email.');
      console.log('The admin can login with:');
      console.log(`Email: ${ADMIN_EMAIL}`);
      console.log('Password: (existing password or use "Forgot Password" to reset)');
    } else {
      console.error('❌ Error creating user:', error.message);
    }
    process.exit(1);
  }
}

createAdminUser();
