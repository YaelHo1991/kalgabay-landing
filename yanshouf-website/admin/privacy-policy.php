<?php
/**
 * Admin Panel - Privacy Policy Editor
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$success = '';
$error = '';

// Path to privacy policy file
$privacyPolicyPath = __DIR__ . '/../privacy-policy/index.html';

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action'])) {
        switch ($_POST['action']) {
            case 'save':
                $content = $_POST['content'] ?? '';

                // Ensure directory exists
                $dir = dirname($privacyPolicyPath);
                if (!is_dir($dir)) {
                    mkdir($dir, 0755, true);
                }

                // Save the file
                if (file_put_contents($privacyPolicyPath, $content) !== false) {
                    $success = 'מדיניות הפרטיות נשמרה בהצלחה!';
                } else {
                    $error = 'שגיאה בשמירת הקובץ. בדוק הרשאות כתיבה.';
                }
                break;
        }
    }
}

// Read current content
$currentContent = '';
if (file_exists($privacyPolicyPath)) {
    $currentContent = file_get_contents($privacyPolicyPath);
}

$pageTitle = "מדיניות פרטיות";
include 'includes/header.php';
?>

<style>
.privacy-page {
    max-width: 1200px;
}

.privacy-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    flex-wrap: wrap;
    gap: 15px;
}

.privacy-header h1 {
    margin: 0;
}

.header-actions {
    display: flex;
    gap: 10px;
}

.editor-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow: hidden;
}

.editor-toolbar {
    background: #f8f9fa;
    padding: 15px 20px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}

.editor-info {
    display: flex;
    align-items: center;
    gap: 15px;
    color: #666;
    font-size: 0.9em;
}

.editor-info i {
    color: #4CAF50;
}

.editor-tabs {
    display: flex;
    gap: 5px;
}

.editor-tab {
    padding: 8px 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.9em;
    transition: all 0.2s;
}

.editor-tab:hover {
    background: #e8f5e9;
}

.editor-tab.active {
    background: #4CAF50;
    color: white;
}

.code-editor {
    width: 100%;
    min-height: 600px;
    padding: 20px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 14px;
    line-height: 1.6;
    border: none;
    resize: vertical;
    direction: ltr;
    text-align: left;
}

.code-editor:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px #4CAF50;
}

.preview-container {
    padding: 0;
    display: none;
}

.preview-container.active {
    display: block;
}

.preview-container iframe {
    width: 100%;
    min-height: 600px;
    border: none;
}

.code-container {
    display: block;
}

.code-container.hidden {
    display: none;
}

.form-actions {
    padding: 20px;
    background: #f8f9fa;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
}

.btn-group {
    display: flex;
    gap: 10px;
}

.link-box {
    background: #e8f5e9;
    padding: 12px 20px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.link-box a {
    color: #2E7D32;
    text-decoration: none;
    font-weight: 500;
}

.link-box a:hover {
    text-decoration: underline;
}

.copy-btn {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.85em;
}

.copy-btn:hover {
    background: #388E3C;
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.85em;
}

.status-badge.exists {
    background: #e8f5e9;
    color: #2E7D32;
}

.status-badge.missing {
    background: #ffebee;
    color: #c62828;
}

.google-info {
    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 25px;
}

.google-info h3 {
    color: #1565c0;
    margin: 0 0 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.google-info p {
    color: #555;
    margin: 0;
    line-height: 1.6;
}

.google-info a {
    color: #1565c0;
    font-weight: 500;
}
</style>

<div class="privacy-page">
    <div class="privacy-header">
        <h1><i class="fas fa-shield-alt"></i> מדיניות פרטיות</h1>
        <div class="header-actions">
            <?php if (file_exists($privacyPolicyPath)): ?>
                <span class="status-badge exists">
                    <i class="fas fa-check-circle"></i> קובץ קיים
                </span>
            <?php else: ?>
                <span class="status-badge missing">
                    <i class="fas fa-exclamation-circle"></i> קובץ לא קיים
                </span>
            <?php endif; ?>
        </div>
    </div>

    <?php if ($success): ?>
        <div class="alert alert-success"><?= $success ?></div>
    <?php endif; ?>

    <?php if ($error): ?>
        <div class="alert alert-error"><?= $error ?></div>
    <?php endif; ?>

    <div class="google-info">
        <h3><i class="fab fa-google"></i> שימוש ב-Google OAuth</h3>
        <p>
            דף זה נדרש עבור אימות האפליקציה ב-Google Cloud Console.<br>
            לאחר השמירה, הכנס את הקישור
            <strong><?= SITE_URL ?>/privacy-policy/</strong>
            בשדה "Application privacy policy link" ב-
            <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank">OAuth consent screen</a>.
        </p>
    </div>

    <form method="POST">
        <input type="hidden" name="action" value="save">

        <div class="editor-container">
            <div class="editor-toolbar">
                <div class="editor-info">
                    <span><i class="fas fa-file-code"></i> privacy-policy/index.html</span>
                    <span><i class="fas fa-clock"></i> <?= file_exists($privacyPolicyPath) ? 'עודכן: ' . date('d/m/Y H:i', filemtime($privacyPolicyPath)) : 'טרם נוצר' ?></span>
                </div>
                <div class="editor-tabs">
                    <button type="button" class="editor-tab active" onclick="showCode()">
                        <i class="fas fa-code"></i> קוד
                    </button>
                    <button type="button" class="editor-tab" onclick="showPreview()">
                        <i class="fas fa-eye"></i> תצוגה מקדימה
                    </button>
                </div>
            </div>

            <div class="code-container" id="codeContainer">
                <textarea name="content" class="code-editor" id="codeEditor" spellcheck="false"><?= htmlspecialchars($currentContent) ?></textarea>
            </div>

            <div class="preview-container" id="previewContainer">
                <iframe id="previewFrame" srcdoc=""></iframe>
            </div>

            <div class="form-actions">
                <div class="link-box">
                    <i class="fas fa-link"></i>
                    <a href="<?= SITE_URL ?>/privacy-policy/" target="_blank"><?= SITE_URL ?>/privacy-policy/</a>
                    <button type="button" class="copy-btn" onclick="copyLink()">
                        <i class="fas fa-copy"></i> העתק
                    </button>
                </div>
                <div class="btn-group">
                    <a href="<?= SITE_URL ?>/privacy-policy/" target="_blank" class="btn btn-secondary">
                        <i class="fas fa-external-link-alt"></i> פתח בחלון חדש
                    </a>
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> שמור שינויים
                    </button>
                </div>
            </div>
        </div>
    </form>
</div>

<script>
function showCode() {
    document.getElementById('codeContainer').classList.remove('hidden');
    document.getElementById('previewContainer').classList.remove('active');
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-tab')[0].classList.add('active');
}

function showPreview() {
    const code = document.getElementById('codeEditor').value;
    document.getElementById('previewFrame').srcdoc = code;
    document.getElementById('codeContainer').classList.add('hidden');
    document.getElementById('previewContainer').classList.add('active');
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.editor-tab')[1].classList.add('active');
}

function copyLink() {
    const link = '<?= SITE_URL ?>/privacy-policy/';
    navigator.clipboard.writeText(link).then(() => {
        const btn = document.querySelector('.copy-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> הועתק!';
        btn.style.background = '#388E3C';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    });
}

// Auto-resize textarea
const textarea = document.getElementById('codeEditor');
textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.max(600, this.scrollHeight) + 'px';
});

// Tab support in textarea
textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 4;
    }
});
</script>

<?php include 'includes/footer.php'; ?>
