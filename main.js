/**
 * KalGabay Landing Page - Main Script
 * ====================================
 * This script loads content from config.js and handles interactivity.
 * No need to modify this file - all content is controlled via config.js
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all sections
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
    const heroTitle = document.getElementById('hero-title');
    const heroTagline = document.getElementById('hero-tagline');
    const heroDescription = document.getElementById('hero-description');

    if (heroTitle) heroTitle.textContent = CONFIG.siteName;
    if (heroTagline) heroTagline.textContent = CONFIG.siteTagline;
    if (heroDescription) heroDescription.textContent = CONFIG.siteDescription;

    // Update download button based on availability
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        if (CONFIG.appLinks.isAvailable) {
            downloadBtn.href = CONFIG.appLinks.googlePlay;
        } else {
            downloadBtn.href = '#download';
        }
    }
}

// ============================================
// FEATURES SECTION
// ============================================
function loadFeatures() {
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

    featuresGrid.innerHTML = CONFIG.features.map(feature => `
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
    // Main Package
    const mainPackageEl = document.getElementById('main-package');
    if (mainPackageEl && CONFIG.products.mainPackage) {
        const pkg = CONFIG.products.mainPackage;
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
    if (additionalProductsEl && CONFIG.products.additionalProducts) {
        additionalProductsEl.innerHTML = CONFIG.products.additionalProducts.map(product => `
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
    const videoTitle = document.getElementById('video-title');
    const videoDescription = document.getElementById('video-description');
    const videoContainer = document.getElementById('video-container');

    if (videoTitle) videoTitle.textContent = CONFIG.video.title;
    if (videoDescription) videoDescription.textContent = CONFIG.video.description;

    if (videoContainer) {
        if (CONFIG.video.isAvailable && CONFIG.video.youtubeId) {
            videoContainer.innerHTML = `
                <iframe
                    src="https://www.youtube.com/embed/${CONFIG.video.youtubeId}?rel=0"
                    title="${CONFIG.video.title}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
                </iframe>
            `;
        } else if (CONFIG.video.isAvailable && CONFIG.video.vimeoId) {
            videoContainer.innerHTML = `
                <iframe
                    src="https://player.vimeo.com/video/${CONFIG.video.vimeoId}"
                    title="${CONFIG.video.title}"
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
    const googlePlayBtn = document.getElementById('google-play-btn');
    const comingSoonMessage = document.getElementById('coming-soon-message');

    if (CONFIG.appLinks.isAvailable) {
        // Use direct download link if available, otherwise Google Play
        const downloadUrl = CONFIG.appLinks.directDownload || CONFIG.appLinks.googlePlay;

        if (googlePlayBtn) {
            googlePlayBtn.href = downloadUrl;
            googlePlayBtn.style.display = 'inline-block';

            // If using direct download, change the button style
            if (CONFIG.appLinks.directDownload) {
                googlePlayBtn.innerHTML = '<i class="fas fa-download"></i> הורד את האפליקציה';
                googlePlayBtn.classList.add('direct-download-btn');
            }
        }
        if (comingSoonMessage) {
            comingSoonMessage.style.display = 'none';
        }

        // Generate Download QR
        generateQRCode('download-qr', downloadUrl);
    } else {
        if (googlePlayBtn) {
            googlePlayBtn.style.display = 'none';
        }
        if (comingSoonMessage) {
            comingSoonMessage.textContent = CONFIG.appLinks.comingSoonMessage;
            comingSoonMessage.style.display = 'block';
        }
    }

    // Generate Video QR
    if (CONFIG.video.isAvailable && CONFIG.video.youtubeId) {
        const videoUrl = `https://www.youtube.com/watch?v=${CONFIG.video.youtubeId}`;
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
    const faqList = document.getElementById('faq-list');
    if (!faqList) return;

    faqList.innerHTML = CONFIG.faq.map((item, index) => `
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
    const emailLink = document.getElementById('contact-email');
    const phoneLink = document.getElementById('contact-phone');
    const whatsappLink = document.getElementById('contact-whatsapp');

    if (emailLink && CONFIG.contact.email) {
        emailLink.href = `mailto:${CONFIG.contact.email}`;
    }

    if (phoneLink && CONFIG.contact.phone) {
        phoneLink.href = `tel:${CONFIG.contact.phone.replace(/[^+\d]/g, '')}`;
    }

    if (whatsappLink && CONFIG.contact.whatsapp) {
        const cleanNumber = CONFIG.contact.whatsapp.replace(/[^+\d]/g, '');
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
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const navbarHeight = document.querySelector('.navbar').offsetHeight;
            const targetPosition = target.offsetTop - navbarHeight - 20;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});
