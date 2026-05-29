/**
 * KalGabay Landing Page - Main Script
 * ====================================
 * This script loads content from Firebase (with config.js as fallback)
 * and handles interactivity.
 */

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

// Dynamic config that will be loaded from Firebase
let DYNAMIC_CONFIG = null;

/**
 * Load configuration from Firebase with fallback to local CONFIG
 */
async function loadConfigFromFirebase() {
    try {
        // Check if Firebase is available
        if (typeof firebase === 'undefined') {
            console.log('Firebase SDK not loaded, using local config');
            return CONFIG;
        }

        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        const db = firebase.database();
        const snapshot = await db.ref('admin/landingContent').once('value');

        if (snapshot.exists()) {
            const firebaseContent = snapshot.val();
            console.log('Loaded content from Firebase');

            // Merge Firebase content with local CONFIG
            return mergeConfig(CONFIG, firebaseContent);
        }

        console.log('No Firebase content found, using local config');
        return CONFIG;
    } catch (error) {
        console.log('Error loading from Firebase, using local config:', error.message);
        return CONFIG;
    }
}

/**
 * Merge Firebase content with local CONFIG
 * Firebase content takes priority
 */
function mergeConfig(localConfig, firebaseContent) {
    const merged = { ...localConfig };

    // Merge products
    if (firebaseContent.products) {
        if (firebaseContent.products.mainPackage) {
            merged.products = merged.products || {};
            merged.products.mainPackage = {
                ...merged.products.mainPackage,
                ...firebaseContent.products.mainPackage,
                // Map imageUrl to image for compatibility
                image: firebaseContent.products.mainPackage.imageUrl || merged.products.mainPackage.image
            };
        }
        if (firebaseContent.products.additionalProducts) {
            merged.products.additionalProducts = firebaseContent.products.additionalProducts.map(p => ({
                ...p,
                image: p.imageUrl || p.image
            }));
        }
    }

    // Merge video
    if (firebaseContent.video) {
        merged.video = {
            ...merged.video,
            ...firebaseContent.video
        };
    }

    // Merge FAQ
    if (firebaseContent.faq && firebaseContent.faq.length > 0) {
        merged.faq = firebaseContent.faq;
    }

    // Merge contact
    if (firebaseContent.contact) {
        merged.contact = {
            ...merged.contact,
            ...firebaseContent.contact
        };
    }

    return merged;
}

document.addEventListener('DOMContentLoaded', async function() {
    // Load config from Firebase with fallback
    DYNAMIC_CONFIG = await loadConfigFromFirebase();

    // Initialize all sections with dynamic config
    initNavigation();
    loadHeroContent();
    loadFeatures();
    loadProducts();
    loadVideo();
    loadDownloadSection();
    loadFAQ();
    loadContactInfo();
    updateFooter();
});

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Close menu when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
        });
    });

    // Navbar background on scroll
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.style.background = 'linear-gradient(135deg, #6B5344 0%, #4A3D2C 100%)';
        } else {
            navbar.style.background = 'linear-gradient(135deg, #8B7355 0%, #6B5344 100%)';
        }
    });
}

// ============================================
// HERO SECTION
// ============================================
function loadHeroContent() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const heroTitle = document.getElementById('hero-title');
    const heroTagline = document.getElementById('hero-tagline');
    const heroDescription = document.getElementById('hero-description');

    if (heroTitle) heroTitle.textContent = config.siteName;
    if (heroTagline) heroTagline.textContent = config.siteTagline;
    if (heroDescription) heroDescription.textContent = config.siteDescription;

    // Update download button based on availability
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        if (config.appLinks.isAvailable) {
            downloadBtn.href = config.appLinks.googlePlay;
        } else {
            downloadBtn.href = '#download';
        }
    }
}

// ============================================
// FEATURES SECTION
// ============================================
function loadFeatures() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const featuresGrid = document.getElementById('features-grid');
    if (!featuresGrid) return;

    const iconMap = {
        'qr-code': 'fa-qrcode',
        'users': 'fa-users',
        'gavel': 'fa-gavel',
        'chart': 'fa-chart-line',
        'whatsapp': 'fa-brands fa-whatsapp',
        'cloud': 'fa-cloud',
        'calendar': 'fa-calendar',
        'print': 'fa-print',
        'sync': 'fa-sync',
        'mobile': 'fa-mobile-alt'
    };

    featuresGrid.innerHTML = config.features.map(feature => `
        <div class="feature-card">
            <div class="icon">
                <i class="fas ${iconMap[feature.icon] || 'fa-star'}"></i>
            </div>
            <h3>${feature.title}</h3>
            <p>${feature.description}</p>
        </div>
    `).join('');
}

// ============================================
// PRODUCTS SECTION
// ============================================
function loadProducts() {
    const config = DYNAMIC_CONFIG || CONFIG;
    // Main Package
    const mainPackageEl = document.getElementById('main-package');
    if (mainPackageEl && config.products.mainPackage) {
        const pkg = config.products.mainPackage;
        mainPackageEl.innerHTML = `
            <div class="package-image">
                <img src="${pkg.image}" alt="${pkg.name}"
                     onerror="this.src='https://via.placeholder.com/300x250/C9A86C/ffffff?text=חבילה+בסיסית'">
            </div>
            <div class="package-content">
                <h3>${pkg.name}</h3>
                <p class="package-description">${pkg.description}</p>
                <div class="package-price">${pkg.currency}${pkg.price}</div>
                <ul class="package-includes">
                    ${pkg.includes.map(item => `<li>${item}</li>`).join('')}
                </ul>
                <a href="#contact" class="btn btn-primary">
                    <i class="fas fa-shopping-cart"></i>
                    הזמן עכשיו
                </a>
            </div>
        `;
    }

    // Additional Products
    const additionalProductsEl = document.getElementById('additional-products');
    if (additionalProductsEl && config.products.additionalProducts) {
        additionalProductsEl.innerHTML = config.products.additionalProducts.map(product => `
            <div class="product-card">
                <img src="${product.image}" alt="${product.name}"
                     onerror="this.src='https://via.placeholder.com/120x120/8B7355/ffffff?text=${encodeURIComponent(product.name)}'">
                <h4>${product.name}</h4>
                <p class="product-description">${product.description}</p>
                <div class="product-price">${product.currency}${product.price}</div>
            </div>
        `).join('');
    }
}

// ============================================
// VIDEO SECTION
// ============================================
function loadVideo() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const videoTitle = document.getElementById('video-title');
    const videoDescription = document.getElementById('video-description');
    const videoContainer = document.getElementById('video-container');

    if (videoTitle) videoTitle.textContent = config.video.title;
    if (videoDescription) videoDescription.textContent = config.video.description;

    if (videoContainer) {
        if (config.video.isAvailable && config.video.youtubeId) {
            videoContainer.innerHTML = `
                <iframe
                    src="https://www.youtube.com/embed/${config.video.youtubeId}?rel=0"
                    title="${config.video.title}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
                </iframe>
            `;
        } else if (config.video.isAvailable && config.video.vimeoId) {
            videoContainer.innerHTML = `
                <iframe
                    src="https://player.vimeo.com/video/${config.video.vimeoId}"
                    title="${config.video.title}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen>
                </iframe>
            `;
        } else {
            videoContainer.innerHTML = `
                <div class="video-placeholder">
                    <i class="fas fa-video"></i>
                    <p>סרטון ההדרכה יהיה זמין בקרוב!</p>
                </div>
            `;
        }
    }
}

// ============================================
// DOWNLOAD SECTION & QR CODES
// ============================================
function loadDownloadSection() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const windowsBtn = document.getElementById('windows-download-btn');
    const androidBtn = document.getElementById('android-download-btn');
    const comingSoonMessage = document.getElementById('coming-soon-message');

    if (config.appLinks.isAvailable) {
        // Windows download button
        if (windowsBtn && config.appLinks.windowsDownload) {
            windowsBtn.href = config.appLinks.windowsDownload;
            windowsBtn.style.display = 'inline-flex';
        }

        // Android download button
        if (androidBtn && config.appLinks.androidDownload) {
            androidBtn.href = config.appLinks.androidDownload;
            androidBtn.style.display = 'inline-flex';
        }

        if (comingSoonMessage) {
            comingSoonMessage.style.display = 'none';
        }

        // Generate Download QR (use Android link for mobile users)
        const qrUrl = config.appLinks.androidDownload || config.appLinks.windowsDownload;
        if (qrUrl) {
            generateQRCode('download-qr', qrUrl);
        }
    } else {
        if (windowsBtn) windowsBtn.style.display = 'none';
        if (androidBtn) androidBtn.style.display = 'none';
        if (comingSoonMessage) {
            comingSoonMessage.textContent = config.appLinks.comingSoonMessage;
            comingSoonMessage.style.display = 'block';
        }
    }

    // Generate Video QR
    if (config.video.isAvailable && config.video.youtubeId) {
        const videoUrl = `https://www.youtube.com/watch?v=${config.video.youtubeId}`;
        generateQRCode('video-qr', videoUrl);
    }
}

function generateQRCode(elementId, url) {
    const element = document.getElementById(elementId);
    if (!element || !url || typeof QRCode === 'undefined') return;

    // Clear existing content
    element.innerHTML = '';

    try {
        new QRCode(element, {
            text: url,
            width: 150,
            height: 150,
            colorDark: "#4A3D2C",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (e) {
        console.error('Error generating QR code:', e);
        element.innerHTML = `
            <div class="qr-placeholder">
                <i class="fas fa-qrcode"></i>
                <p>QR Code</p>
            </div>
        `;
    }
}

// ============================================
// FAQ SECTION
// ============================================
function loadFAQ() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const faqList = document.getElementById('faq-list');
    if (!faqList) return;

    faqList.innerHTML = config.faq.map((item, index) => `
        <div class="faq-item">
            <button class="faq-question" onclick="toggleFAQ(${index})">
                <span>${item.question}</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="faq-answer">
                <p>${item.answer}</p>
            </div>
        </div>
    `).join('');
}

function toggleFAQ(index) {
    const faqItems = document.querySelectorAll('.faq-item');
    const clickedItem = faqItems[index];

    // Close all other items
    faqItems.forEach((item, i) => {
        if (i !== index) {
            item.classList.remove('active');
        }
    });

    // Toggle clicked item
    clickedItem.classList.toggle('active');
}

// Make toggleFAQ available globally
window.toggleFAQ = toggleFAQ;

// ============================================
// CONTACT SECTION
// ============================================
function loadContactInfo() {
    const config = DYNAMIC_CONFIG || CONFIG;
    const emailLink = document.getElementById('contact-email');
    const phoneLink = document.getElementById('contact-phone');
    const whatsappLink = document.getElementById('contact-whatsapp');

    if (emailLink && config.contact.email) {
        emailLink.href = `mailto:${config.contact.email}`;
    }

    if (phoneLink && config.contact.phone) {
        phoneLink.href = `tel:${config.contact.phone.replace(/[^+\d]/g, '')}`;
    }

    if (whatsappLink && config.contact.whatsapp) {
        const cleanNumber = config.contact.whatsapp.replace(/[^+\d]/g, '');
        whatsappLink.href = `https://wa.me/${cleanNumber}`;
    }
}

// ============================================
// FOOTER
// ============================================
function updateFooter() {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
}

// ============================================
// SMOOTH SCROLL (Enhancement)
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        // Only handle internal anchor links (not full URLs or just "#")
        if (href && href.length > 1 && href.startsWith('#') && !href.includes('://')) {
            e.preventDefault();
            try {
                const target = document.querySelector(href);
                if (target) {
                    const navbarHeight = document.querySelector('.navbar').offsetHeight;
                    const targetPosition = target.offsetTop - navbarHeight - 20;
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            } catch (err) {
                // Invalid selector, let browser handle normally
                console.log('Smooth scroll skipped for:', href);
            }
        }
    });
});
