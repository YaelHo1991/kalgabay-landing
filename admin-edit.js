/**
 * KalGabay Landing Page - Admin Edit Mode
 * ========================================
 * Allows admins to edit landing page content directly and save to Firebase
 */

// Admin state
let isAdminLoggedIn = false;
let isEditMode = false;
let currentUser = null;
let editableContent = null;

// Firebase Auth configuration (same as main app)
const firebaseAuthConfig = {
    apiKey: "AIzaSyDprTzQU5j1GjcHVb58gJA31bF8nPSK410",
    authDomain: "qr-card-matcher.firebaseapp.com",
    databaseURL: "https://qr-card-matcher-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "qr-card-matcher",
    storageBucket: "qr-card-matcher.firebasestorage.app",
    messagingSenderId: "804321922176",
    appId: "1:804321922176:web:3eab516e01a37ad7ffaa65"
};

// Admin emails (Firebase keys use , instead of .)
const ADMIN_EMAILS = ['alberthouri@gmail.com', 'ayelho@gmail.com'];

/**
 * Initialize admin edit functionality
 * Only activates if opened with ?edit=true parameter (from admin panel)
 */
function initAdminEdit() {
    // Check if edit mode is requested via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const editRequested = urlParams.get('edit') === 'true';

    if (!editRequested) {
        // Not in edit mode - don't show any admin UI
        return;
    }

    // Edit mode requested - show toolbar and enable editing
    console.log('Admin edit mode activated via URL parameter');

    // Listen for messages from parent window (admin panel)
    window.addEventListener('message', handleParentMessage);

    // Notify parent that we're ready
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'LANDING_READY' }, '*');
    }

    // Auto-enter edit mode
    isAdminLoggedIn = true;
    enterEditMode();
}

/**
 * Handle messages from parent window (admin panel)
 */
function handleParentMessage(event) {
    const { type, data } = event.data || {};

    switch (type) {
        case 'SAVE_CONTENT':
            saveChanges();
            break;
        case 'CANCEL_EDIT':
            cancelEdit();
            break;
        case 'GET_CONTENT':
            // Send current content back to parent
            window.parent.postMessage({
                type: 'CONTENT_DATA',
                data: editableContent
            }, '*');
            break;
    }
}

/**
 * Enter edit mode
 */
function enterEditMode() {
    isEditMode = true;

    // Load current content for editing
    editableContent = JSON.parse(JSON.stringify(DYNAMIC_CONFIG || CONFIG));

    // Make elements editable
    makeEditable();

    // Show edit toolbar
    showEditToolbar();

    showToast('מצב עריכה פעיל - לחץ על טקסט כדי לערוך', 'info');
}

/**
 * Make content elements editable
 */
function makeEditable() {
    // Hero section
    makeTextEditable('hero-title', 'siteName');
    makeTextEditable('hero-tagline', 'siteTagline');
    makeTextEditable('hero-description', 'siteDescription');

    // Make product cards editable
    const mainPackage = document.getElementById('main-package');
    if (mainPackage) {
        mainPackage.classList.add('editable-section');
        addEditOverlay(mainPackage, 'mainPackage', editMainPackage);
    }

    // Make FAQ editable
    const faqSection = document.getElementById('faq-list');
    if (faqSection) {
        faqSection.classList.add('editable-section');
        addEditOverlay(faqSection, 'faq', editFAQ);
    }

    // Make contact editable
    const contactSection = document.querySelector('.contact-options');
    if (contactSection) {
        contactSection.classList.add('editable-section');
        addEditOverlay(contactSection, 'contact', editContact);
    }

    // Make video section editable
    const videoContainer = document.getElementById('video-container');
    if (videoContainer) {
        videoContainer.classList.add('editable-section');
        addEditOverlay(videoContainer, 'video', editVideo);
    }

    // Add visual indicators
    document.body.classList.add('edit-mode');
}

/**
 * Make text element editable
 */
function makeTextEditable(elementId, configKey) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.classList.add('editable-text');
    element.contentEditable = true;

    element.addEventListener('blur', () => {
        if (configKey.includes('.')) {
            const keys = configKey.split('.');
            let obj = editableContent;
            for (let i = 0; i < keys.length - 1; i++) {
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = element.textContent;
        } else {
            editableContent[configKey] = element.textContent;
        }
    });
}

/**
 * Add edit overlay to section
 */
function addEditOverlay(element, sectionName, editFunction) {
    const overlay = document.createElement('div');
    overlay.className = 'edit-overlay';
    overlay.innerHTML = `<button class="edit-section-btn"><i class="fas fa-edit"></i> ערוך ${getSectionLabel(sectionName)}</button>`;
    overlay.querySelector('button').onclick = (e) => {
        e.stopPropagation();
        editFunction();
    };
    element.style.position = 'relative';
    element.appendChild(overlay);
}

/**
 * Get section label in Hebrew
 */
function getSectionLabel(sectionName) {
    const labels = {
        'mainPackage': 'חבילה ראשית',
        'faq': 'שאלות נפוצות',
        'contact': 'פרטי קשר',
        'video': 'סרטון'
    };
    return labels[sectionName] || sectionName;
}

/**
 * Show edit toolbar
 */
function showEditToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'edit-toolbar';
    toolbar.className = 'edit-toolbar';
    toolbar.innerHTML = `
        <div class="toolbar-content">
            <span class="toolbar-status"><i class="fas fa-edit"></i> מצב עריכה פעיל - לחץ על אזורים לעריכה</span>
            <div class="toolbar-actions">
                <button onclick="cancelEdit()" class="toolbar-btn cancel"><i class="fas fa-times"></i> בטל</button>
                <button onclick="saveChanges()" class="toolbar-btn save"><i class="fas fa-save"></i> שמור שינויים</button>
            </div>
        </div>
    `;
    document.body.appendChild(toolbar);

    // Add styles
    addAdminStyles();
}

/**
 * Edit main package
 */
function editMainPackage() {
    const pkg = editableContent.products?.mainPackage || {};

    showEditModal('עריכת החבילה הראשית', `
        <div class="admin-form-group">
            <label>שם המוצר</label>
            <input type="text" id="edit-pkg-name" value="${pkg.name || ''}">
        </div>
        <div class="admin-form-group">
            <label>תיאור</label>
            <textarea id="edit-pkg-desc" rows="3">${pkg.description || ''}</textarea>
        </div>
        <div class="admin-form-group">
            <label>מחיר</label>
            <input type="number" id="edit-pkg-price" value="${pkg.price || 0}">
        </div>
        <div class="admin-form-group">
            <label>מה כולל? (שורה לכל פריט)</label>
            <textarea id="edit-pkg-includes" rows="5">${(pkg.includes || []).join('\n')}</textarea>
        </div>
    `, () => {
        editableContent.products = editableContent.products || {};
        editableContent.products.mainPackage = {
            ...editableContent.products.mainPackage,
            name: document.getElementById('edit-pkg-name').value,
            description: document.getElementById('edit-pkg-desc').value,
            price: parseInt(document.getElementById('edit-pkg-price').value) || 0,
            includes: document.getElementById('edit-pkg-includes').value.split('\n').filter(Boolean)
        };
        refreshMainPackage();
    });
}

/**
 * Edit FAQ
 */
function editFAQ() {
    const faq = editableContent.faq || [];

    let faqHtml = faq.map((item, i) => `
        <div class="faq-edit-item" data-index="${i}">
            <div class="admin-form-group">
                <label>שאלה ${i + 1}</label>
                <input type="text" class="faq-question-input" value="${item.question || ''}">
            </div>
            <div class="admin-form-group">
                <label>תשובה</label>
                <textarea class="faq-answer-input" rows="2">${item.answer || ''}</textarea>
            </div>
            <button type="button" class="delete-faq-btn" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    showEditModal('עריכת שאלות נפוצות', `
        <div id="faq-edit-list">${faqHtml}</div>
        <button type="button" class="add-item-btn" onclick="addFAQItem()"><i class="fas fa-plus"></i> הוסף שאלה</button>
    `, () => {
        const items = document.querySelectorAll('.faq-edit-item');
        editableContent.faq = Array.from(items).map((item, i) => ({
            id: `faq_${i}`,
            question: item.querySelector('.faq-question-input').value,
            answer: item.querySelector('.faq-answer-input').value
        })).filter(f => f.question && f.answer);
        refreshFAQ();
    });
}

/**
 * Add FAQ item
 */
function addFAQItem() {
    const list = document.getElementById('faq-edit-list');
    const index = list.children.length;
    const itemHtml = `
        <div class="faq-edit-item" data-index="${index}">
            <div class="admin-form-group">
                <label>שאלה ${index + 1}</label>
                <input type="text" class="faq-question-input" value="">
            </div>
            <div class="admin-form-group">
                <label>תשובה</label>
                <textarea class="faq-answer-input" rows="2"></textarea>
            </div>
            <button type="button" class="delete-faq-btn" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
        </div>
    `;
    list.insertAdjacentHTML('beforeend', itemHtml);
}

/**
 * Edit contact info
 */
function editContact() {
    const contact = editableContent.contact || {};

    showEditModal('עריכת פרטי קשר', `
        <div class="admin-form-group">
            <label><i class="fas fa-envelope"></i> אימייל</label>
            <input type="email" id="edit-contact-email" value="${contact.email || ''}" dir="ltr">
        </div>
        <div class="admin-form-group">
            <label><i class="fas fa-phone"></i> טלפון</label>
            <input type="tel" id="edit-contact-phone" value="${contact.phone || ''}" dir="ltr">
        </div>
        <div class="admin-form-group">
            <label><i class="fab fa-whatsapp"></i> וואטסאפ</label>
            <input type="tel" id="edit-contact-whatsapp" value="${contact.whatsapp || ''}" dir="ltr" placeholder="+972501234567">
        </div>
    `, () => {
        editableContent.contact = {
            email: document.getElementById('edit-contact-email').value,
            phone: document.getElementById('edit-contact-phone').value,
            whatsapp: document.getElementById('edit-contact-whatsapp').value
        };
    });
}

/**
 * Edit video settings
 */
function editVideo() {
    const video = editableContent.video || {};

    showEditModal('עריכת הגדרות סרטון', `
        <div class="admin-form-group">
            <label>
                <input type="checkbox" id="edit-video-available" ${video.isAvailable ? 'checked' : ''}>
                הצג סרטון באתר
            </label>
        </div>
        <div class="admin-form-group">
            <label>YouTube Video ID</label>
            <input type="text" id="edit-video-id" value="${video.youtubeId || ''}" dir="ltr" placeholder="dQw4w9WgXcQ">
            <small>החלק שמופיע אחרי "v=" בלינק של YouTube</small>
        </div>
        <div class="admin-form-group">
            <label>כותרת</label>
            <input type="text" id="edit-video-title" value="${video.title || ''}">
        </div>
        <div class="admin-form-group">
            <label>תיאור</label>
            <textarea id="edit-video-desc" rows="2">${video.description || ''}</textarea>
        </div>
    `, () => {
        editableContent.video = {
            isAvailable: document.getElementById('edit-video-available').checked,
            youtubeId: document.getElementById('edit-video-id').value,
            title: document.getElementById('edit-video-title').value,
            description: document.getElementById('edit-video-desc').value
        };
        refreshVideo();
    });
}

/**
 * Show edit modal
 */
function showEditModal(title, content, onSave) {
    const modal = document.createElement('div');
    modal.id = 'edit-content-modal';
    modal.className = 'admin-modal';
    modal.innerHTML = `
        <div class="admin-modal-content edit-modal">
            <button class="admin-modal-close" onclick="closeEditModal()">&times;</button>
            <h2>${title}</h2>
            <form id="edit-content-form">
                ${content}
                <div class="modal-actions">
                    <button type="button" onclick="closeEditModal()" class="admin-cancel-btn">ביטול</button>
                    <button type="submit" class="admin-submit-btn"><i class="fas fa-check"></i> אישור</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('edit-content-form').onsubmit = (e) => {
        e.preventDefault();
        onSave();
        closeEditModal();
        showToast('השינויים נשמרו (זמנית) - לחץ "שמור שינויים" לשמירה קבועה', 'info');
    };
}

/**
 * Close edit modal
 */
function closeEditModal() {
    const modal = document.getElementById('edit-content-modal');
    if (modal) modal.remove();
}

/**
 * Refresh main package display
 */
function refreshMainPackage() {
    const pkg = editableContent.products?.mainPackage;
    if (!pkg) return;

    const mainPackageEl = document.getElementById('main-package');
    if (mainPackageEl) {
        const contentDiv = mainPackageEl.querySelector('.package-content');
        if (contentDiv) {
            contentDiv.querySelector('h3').textContent = pkg.name;
            contentDiv.querySelector('.package-description').textContent = pkg.description;
            contentDiv.querySelector('.package-price').innerHTML = `${pkg.currency || '₪'}${pkg.price}`;
        }
    }
}

/**
 * Refresh FAQ display
 */
function refreshFAQ() {
    const faqList = document.getElementById('faq-list');
    if (!faqList || !editableContent.faq) return;

    faqList.innerHTML = editableContent.faq.map((item, index) => `
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

    // Re-add edit overlay
    faqList.classList.add('editable-section');
    const existingOverlay = faqList.querySelector('.edit-overlay');
    if (!existingOverlay) {
        addEditOverlay(faqList, 'faq', editFAQ);
    }
}

/**
 * Refresh video display
 */
function refreshVideo() {
    const video = editableContent.video;
    if (!video) return;

    const videoTitle = document.getElementById('video-title');
    const videoDesc = document.getElementById('video-description');
    const videoContainer = document.getElementById('video-container');

    if (videoTitle) videoTitle.textContent = video.title;
    if (videoDesc) videoDesc.textContent = video.description;

    if (videoContainer) {
        if (video.isAvailable && video.youtubeId) {
            videoContainer.innerHTML = `
                <iframe
                    src="https://www.youtube.com/embed/${video.youtubeId}?rel=0"
                    title="${video.title}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

        // Re-add edit overlay
        videoContainer.classList.add('editable-section');
        addEditOverlay(videoContainer, 'video', editVideo);
    }
}

/**
 * Cancel edit mode
 */
function cancelEdit() {
    if (confirm('לבטל את כל השינויים?')) {
        exitEditMode();
        location.reload();
    }
}

/**
 * Exit edit mode
 */
function exitEditMode() {
    isEditMode = false;
    updateAdminButton();

    // Remove edit indicators
    document.body.classList.remove('edit-mode');

    // Remove contenteditable
    document.querySelectorAll('.editable-text').forEach(el => {
        el.contentEditable = false;
        el.classList.remove('editable-text');
    });

    // Remove overlays
    document.querySelectorAll('.edit-overlay').forEach(el => el.remove());
    document.querySelectorAll('.editable-section').forEach(el => {
        el.classList.remove('editable-section');
    });

    // Remove toolbar
    const toolbar = document.getElementById('edit-toolbar');
    if (toolbar) toolbar.remove();
}

/**
 * Save changes to Firebase
 */
async function saveChanges() {
    try {
        showToast('שומר שינויים...', 'info');

        // Prepare content for Firebase
        const firebaseContent = {
            products: {
                mainPackage: {
                    name: editableContent.products?.mainPackage?.name || '',
                    description: editableContent.products?.mainPackage?.description || '',
                    price: editableContent.products?.mainPackage?.price || 0,
                    currency: editableContent.products?.mainPackage?.currency || '₪',
                    imageUrl: editableContent.products?.mainPackage?.imageUrl || editableContent.products?.mainPackage?.image || '',
                    includes: editableContent.products?.mainPackage?.includes || []
                },
                additionalProducts: editableContent.products?.additionalProducts || []
            },
            video: editableContent.video || {},
            faq: editableContent.faq || [],
            contact: editableContent.contact || {},
            lastUpdated: new Date().toISOString()
        };

        // Save to Firebase
        const db = firebase.database();
        await db.ref('admin/landingContent').set(firebaseContent);

        showToast('השינויים נשמרו בהצלחה!', 'success');

        // Notify parent window
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'SAVE_SUCCESS' }, '*');
        }

        exitEditMode();

        // Update DYNAMIC_CONFIG
        DYNAMIC_CONFIG = { ...CONFIG, ...firebaseContent };

    } catch (error) {
        console.error('Save error:', error);
        showToast('שגיאה בשמירה: ' + error.message, 'error');

        // Notify parent window of error
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'SAVE_ERROR', error: error.message }, '*');
        }
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.admin-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Add admin styles
 */
function addAdminStyles() {
    // Only add styles once
    if (document.getElementById('admin-edit-styles')) return;

    const style = document.createElement('style');
    style.id = 'admin-edit-styles';
    style.textContent = `
        /* Modal */
        .admin-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }

        .admin-modal-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            position: relative;
        }

        .admin-modal-content.edit-modal {
            max-width: 600px;
        }

        .admin-modal-close {
            position: absolute;
            top: 10px;
            left: 10px;
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #666;
        }

        .admin-modal h2 {
            margin: 0 0 20px;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .admin-form-group {
            margin-bottom: 15px;
        }

        .admin-form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }

        .admin-form-group input,
        .admin-form-group textarea,
        .admin-form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1rem;
            font-family: inherit;
            transition: border-color 0.2s;
        }

        .admin-form-group input:focus,
        .admin-form-group textarea:focus {
            outline: none;
            border-color: #667eea;
        }

        .admin-form-group small {
            color: #888;
            font-size: 0.85rem;
            margin-top: 5px;
            display: block;
        }

        .admin-error {
            color: #e74c3c;
            padding: 10px;
            background: #ffeaea;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .admin-submit-btn {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform 0.2s;
        }

        .admin-submit-btn:hover {
            transform: translateY(-2px);
        }

        .admin-cancel-btn {
            padding: 12px 24px;
            background: #f5f5f5;
            color: #666;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
        }

        .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }

        .modal-actions .admin-submit-btn {
            flex: 1;
        }

        /* Edit Mode */
        body.edit-mode .editable-text {
            outline: 2px dashed #667eea;
            outline-offset: 4px;
            cursor: text;
            min-height: 1em;
        }

        body.edit-mode .editable-text:focus {
            outline: 2px solid #667eea;
            background: rgba(102, 126, 234, 0.1);
        }

        body.edit-mode .editable-section {
            position: relative;
        }

        .edit-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(102, 126, 234, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            z-index: 10;
        }

        .editable-section:hover .edit-overlay {
            opacity: 1;
            pointer-events: auto;
        }

        .edit-section-btn {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 25px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        /* Edit Toolbar */
        .edit-toolbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 20px;
            z-index: 9998;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .toolbar-content {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .toolbar-status {
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .toolbar-actions {
            display: flex;
            gap: 10px;
        }

        .toolbar-btn {
            padding: 8px 20px;
            border: none;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }

        .toolbar-btn.cancel {
            background: rgba(255,255,255,0.2);
            color: white;
        }

        .toolbar-btn.save {
            background: white;
            color: #667eea;
        }

        .toolbar-btn:hover {
            transform: translateY(-2px);
        }

        /* FAQ Edit */
        .faq-edit-item {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 15px;
            position: relative;
        }

        .delete-faq-btn {
            position: absolute;
            top: 10px;
            left: 10px;
            background: #e74c3c;
            color: white;
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            cursor: pointer;
        }

        .add-item-btn {
            width: 100%;
            padding: 12px;
            background: #f0f0f0;
            border: 2px dashed #ccc;
            border-radius: 10px;
            font-size: 1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #666;
            transition: all 0.2s;
        }

        .add-item-btn:hover {
            background: #e8e8e8;
            border-color: #999;
        }

        /* Toast */
        .admin-toast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            padding: 12px 24px;
            background: #333;
            color: white;
            border-radius: 25px;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10001;
            opacity: 0;
            transition: all 0.3s ease;
        }

        .admin-toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        .admin-toast.success {
            background: #27ae60;
        }

        .admin-toast.error {
            background: #e74c3c;
        }

        .admin-toast.info {
            background: #3498db;
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initAdminEdit);

// Make functions globally available
window.closeAdminModal = closeAdminModal;
window.handleAdminLogin = handleAdminLogin;
window.closeEditModal = closeEditModal;
window.cancelEdit = cancelEdit;
window.saveChanges = saveChanges;
window.addFAQItem = addFAQItem;
