/**
 * KalGabay Landing Page Configuration
 * =====================================
 *
 * Edit this file to update all content on the landing page.
 * No need to touch the HTML or CSS files!
 *
 * After making changes, just refresh the page to see updates.
 */

const CONFIG = {
    // ============================================
    // GENERAL SETTINGS
    // ============================================
    siteName: "KalGabay",
    siteTagline: "ניהול בית הכנסת בקלות ויעילות",
    siteDescription: "מערכת חכמה לניהול מצוות, מתפללים ותשלומים בבית הכנסת",

    // Contact Information
    contact: {
        email: "contact@kalgabay.com",
        phone: "+972-XX-XXX-XXXX",
        whatsapp: "+972XXXXXXXXX"
    },

    // ============================================
    // APP DOWNLOAD LINKS
    // ============================================
    appLinks: {
        // Set to true when the app is available in stores
        isAvailable: false,

        // Update these when the app is published
        googlePlay: "https://play.google.com/store/apps/details?id=com.kalgabay.app",
        appStore: "https://apps.apple.com/app/kalgabay/id000000000",

        // Direct APK download (optional, for testing)
        directDownload: "",

        // Message shown when app is not yet available
        comingSoonMessage: "האפליקציה תהיה זמינה בקרוב בחנות Google Play!"
    },

    // ============================================
    // VIDEO TUTORIAL
    // ============================================
    video: {
        // Set to true when video is ready
        isAvailable: false,

        // YouTube video ID (the part after v= in the URL)
        // Example: for https://youtube.com/watch?v=ABC123 use "ABC123"
        youtubeId: "",

        // Alternative: Vimeo video ID
        vimeoId: "",

        // Video title and description
        title: "איך להשתמש ב-KalGabay?",
        description: "סרטון הדרכה קצר שמסביר את כל התכונות של המערכת"
    },

    // ============================================
    // PRODUCTS & PRICING
    // ============================================
    products: {
        // Main Package
        mainPackage: {
            name: "חבילה בסיסית",
            description: "כל מה שצריך להתחיל לעבוד עם KalGabay",
            price: 499, // Update with real price
            currency: "₪",
            includes: [
                "אפליקציית KalGabay",
                "100 כרטיסים עם גלגלות",
                "100 מעטפות פלסטיק מיוחדות",
                "גיליון מדבקות שקופות (50 מדבקות)",
                "הדרכה מלאה"
            ],
            image: "images/main-package.png"
        },

        // Individual Products
        additionalProducts: [
            {
                id: "envelopes-pack",
                name: "מעטפות נוספות",
                description: "חבילת 50 מעטפות פלסטיק איכותיות",
                price: 79,
                currency: "₪",
                image: "images/envelopes.png"
            },
            {
                id: "cards-pack",
                name: "כרטיסים נוספים",
                description: "חבילת 50 כרטיסים עם גלגלות",
                price: 99,
                currency: "₪",
                image: "images/cards.png"
            },
            {
                id: "stickers-pack",
                name: "מדבקות שקופות",
                description: "גיליון 100 מדבקות למדפסת",
                price: 49,
                currency: "₪",
                image: "images/stickers.png"
            },
            {
                id: "premium-support",
                name: "תמיכה פרימיום",
                description: "תמיכה טלפונית ומענה מהיר לשנה",
                price: 199,
                currency: "₪",
                image: "images/support.png"
            }
        ]
    },

    // ============================================
    // FEATURES LIST
    // ============================================
    features: [
        {
            icon: "qr-code",
            title: "סריקת QR מהירה",
            description: "סרקו כרטיסי מתפללים ומצוות בשניות"
        },
        {
            icon: "users",
            title: "ניהול מתפללים",
            description: "מאגר מתפללים מסודר עם פרטי קשר"
        },
        {
            icon: "gavel",
            title: "מכירת מצוות",
            description: "מערכת מכירה פומבית חכמה"
        },
        {
            icon: "chart",
            title: "סטטיסטיקות",
            description: "מעקב אחר הכנסות ותשלומים"
        },
        {
            icon: "whatsapp",
            title: "תזכורות WhatsApp",
            description: "שליחת תזכורות תשלום אוטומטיות"
        },
        {
            icon: "cloud",
            title: "סנכרון בענן",
            description: "גיבוי אוטומטי וגישה מכל מקום"
        }
    ],

    // ============================================
    // TESTIMONIALS (Optional)
    // ============================================
    testimonials: [
        {
            name: "הרב משה כהן",
            synagogue: "בית הכנסת אור חדש",
            quote: "המערכת שינתה לנו את החיים. הכל מסודר ומאורגן!",
            image: "images/testimonial1.png"
        },
        {
            name: "דוד לוי",
            synagogue: "גבאי בבית הכנסת המרכזי",
            quote: "חוסך לנו שעות של עבודה כל שבוע.",
            image: "images/testimonial2.png"
        }
    ],

    // ============================================
    // FAQ
    // ============================================
    faq: [
        {
            question: "האם צריך חיבור לאינטרנט?",
            answer: "האפליקציה עובדת גם במצב לא מקוון. הנתונים מסתנכרנים אוטומטית כשיש חיבור."
        },
        {
            question: "איך מדפיסים את המדבקות?",
            answer: "המדבקות מותאמות לכל מדפסת רגילה. פשוט הדביקו את הגיליון והדפיסו."
        },
        {
            question: "האם יש תמיכה טכנית?",
            answer: "כן! אנחנו זמינים במייל ובוואטסאפ לכל שאלה."
        },
        {
            question: "האם אפשר לייבא נתונים קיימים?",
            answer: "כן, ניתן לייבא רשימת מתפללים מקובץ Excel."
        }
    ],

    // ============================================
    // SOCIAL MEDIA & LINKS
    // ============================================
    social: {
        facebook: "",
        instagram: "",
        youtube: "",
        whatsappGroup: ""
    },

    // ============================================
    // COLORS (matches the app theme)
    // These are used by the CSS, but you can override here
    // ============================================
    colors: {
        primary: "#C9A86C",      // Gold/Beige
        primaryDark: "#8B7355",  // Dark Brown
        secondary: "#6B5344",    // Medium Brown
        accent: "#5D4E37",       // Accent Brown
        background: "#f6f6f6",   // Light Background
        text: "#333333",         // Main Text
        textLight: "#666666"     // Secondary Text
    }
};

// Don't modify below this line
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
