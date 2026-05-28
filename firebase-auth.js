/**
 * KalGabay - Firebase Authentication Module
 * ==========================================
 * Handles user registration and authentication
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getDatabase,
    ref,
    set
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDprTzQU5j1GjcHVb58gJA31bF8nPSK410",
    authDomain: "qr-card-matcher.firebaseapp.com",
    databaseURL: "https://qr-card-matcher-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "qr-card-matcher",
    storageBucket: "qr-card-matcher.firebasestorage.app",
    messagingSenderId: "804321922176",
    appId: "1:804321922176:web:3eab516e01a37ad7ffaa65"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// DOM Elements
const form = document.getElementById('register-form');
const errorDiv = document.getElementById('form-error');
const successDiv = document.getElementById('form-success');
const submitBtn = document.getElementById('submit-btn');

// Show error message
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
}

// Show success message
function showSuccess(message) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    errorDiv.style.display = 'none';
}

// Hide messages
function hideMessages() {
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
}

// Set loading state
function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> מבצע רישום...';
    } else {
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> הירשם וקבל גישה';
    }
}

// Translate Firebase error messages to Hebrew
function translateError(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'כתובת האימייל כבר רשומה במערכת. נסה להתחבר או השתמש באימייל אחר.',
        'auth/invalid-email': 'כתובת האימייל אינה תקינה.',
        'auth/weak-password': 'הסיסמה חלשה מדי. יש להשתמש בלפחות 6 תווים.',
        'auth/operation-not-allowed': 'הרשמה באמצעות אימייל וסיסמה אינה מופעלת.',
        'auth/network-request-failed': 'בעיית תקשורת. בדוק את חיבור האינטרנט ונסה שוב.',
        'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
        'auth/internal-error': 'שגיאה פנימית. נסה שוב מאוחר יותר.'
    };

    return errorMessages[errorCode] || 'אירעה שגיאה בהרשמה. נסה שוב.';
}

// Handle form submission
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessages();

        // Get form values
        const synagogueName = document.getElementById('synagogue-name').value.trim();
        const contactName = document.getElementById('contact-name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('password-confirm').value;

        // Validate
        if (!synagogueName || !contactName || !email || !phone || !password) {
            showError('נא למלא את כל השדות');
            return;
        }

        if (password !== passwordConfirm) {
            showError('הסיסמאות אינן תואמות');
            return;
        }

        if (password.length < 6) {
            showError('הסיסמה חייבת להכיל לפחות 6 תווים');
            return;
        }

        setLoading(true);

        try {
            // Create user in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Save user data to Realtime Database
            const userData = {
                email: email,
                synagogueName: synagogueName,
                contactName: contactName,
                phone: phone,
                createdAt: new Date().toISOString(),
                subscription: {
                    status: 'trial',
                    startDate: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days trial
                }
            };

            await set(ref(database, `users/${user.uid}`), userData);

            // Success!
            showSuccess('ההרשמה הושלמה בהצלחה! כעת ניתן להוריד את האפליקציה ולהתחבר עם פרטי המשתמש.');
            form.reset();

            // Scroll to download section after a moment
            setTimeout(() => {
                document.getElementById('download').scrollIntoView({ behavior: 'smooth' });
            }, 2000);

        } catch (error) {
            console.error('Registration error:', error);
            showError(translateError(error.code));
        } finally {
            setLoading(false);
        }
    });
}

console.log('Firebase Auth module loaded');
