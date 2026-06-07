<?php
/**
 * Test PDF Generation
 * This page lets you test the TCPDF-based label generation
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$pageTitle = "בדיקת יצירת PDF";
include 'includes/header.php';

// Get a user with data for testing
$db = getDB();
$testUser = null;
$testUserData = null;

$stmt = $db->query("
    SELECT u.*,
           (SELECT COUNT(*) FROM app_members WHERE user_id = u.id) as member_count,
           (SELECT COUNT(*) FROM app_tickets WHERE user_id = u.id) as ticket_count
    FROM app_users u
    WHERE u.id IN (SELECT DISTINCT user_id FROM app_members)
    OR u.id IN (SELECT DISTINCT user_id FROM app_tickets)
    LIMIT 1
");
$testUser = $stmt->fetch();

if ($testUser) {
    // Get sample members
    $stmt = $db->prepare("SELECT * FROM app_members WHERE user_id = ? LIMIT 5");
    $stmt->execute([$testUser['id']]);
    $sampleMembers = $stmt->fetchAll();

    // Get sample tickets
    $stmt = $db->prepare("SELECT * FROM app_tickets WHERE user_id = ? LIMIT 5");
    $stmt->execute([$testUser['id']]);
    $sampleTickets = $stmt->fetchAll();
}
?>

<style>
.test-container {
    max-width: 900px;
    margin: 0 auto;
}
.test-card {
    background: white;
    border-radius: 12px;
    padding: 25px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
.test-card h3 {
    margin-bottom: 15px;
    color: #1e40af;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 10px;
}
.status {
    padding: 10px 15px;
    border-radius: 8px;
    margin-bottom: 10px;
}
.status.success { background: #d1fae5; color: #065f46; }
.status.error { background: #fee2e2; color: #991b1b; }
.status.info { background: #dbeafe; color: #1e40af; }

.btn-test {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    text-decoration: none;
    margin: 5px;
    cursor: pointer;
    border: none;
}
.btn-test.primary { background: #2563eb; color: white; }
.btn-test.success { background: #10b981; color: white; }
.btn-test.purple { background: #7c3aed; color: white; }
.btn-test:hover { opacity: 0.9; }

.data-preview {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 15px;
    margin: 15px 0;
    font-size: 13px;
}
.data-preview table {
    width: 100%;
    border-collapse: collapse;
}
.data-preview th, .data-preview td {
    padding: 8px;
    text-align: right;
    border-bottom: 1px solid #e2e8f0;
}
.data-preview th {
    background: #f1f5f9;
    font-weight: 600;
}
</style>

<div class="test-container">
    <a href="users.php" class="btn btn-secondary" style="margin-bottom: 20px; display: inline-block;">
        <i class="fas fa-arrow-right"></i> חזרה למשתמשים
    </a>

    <div class="test-card">
        <h3><i class="fas fa-flask"></i> בדיקת ספריות PDF</h3>

        <?php
        // Check if TCPDF is available
        $tcpdfPath = __DIR__ . '/../lib/TCPDF-main/tcpdf.php';
        if (file_exists($tcpdfPath)) {
            echo '<div class="status success">✓ TCPDF נמצא ב: lib/TCPDF-main/</div>';
        } else {
            echo '<div class="status error">✗ TCPDF לא נמצא! העלה את תיקיית lib/TCPDF-main/</div>';
        }

        // Check if generate-labels-pdf.php exists
        $apiPath = __DIR__ . '/../api/generate-labels-pdf.php';
        if (file_exists($apiPath)) {
            echo '<div class="status success">✓ api/generate-labels-pdf.php קיים</div>';
        } else {
            echo '<div class="status error">✗ api/generate-labels-pdf.php לא נמצא!</div>';
        }
        ?>
    </div>

    <?php if ($testUser): ?>
    <div class="test-card">
        <h3><i class="fas fa-user"></i> משתמש לבדיקה: <?= sanitize($testUser['synagogue_name']) ?></h3>

        <div class="status info">
            <strong>מזהה:</strong> <?= $testUser['id'] ?> |
            <strong>מתפללים:</strong> <?= $testUser['member_count'] ?> |
            <strong>מצוות:</strong> <?= $testUser['ticket_count'] ?>
        </div>

        <?php if (!empty($sampleMembers)): ?>
        <div class="data-preview">
            <strong>דוגמת מתפללים (<?= count($sampleMembers) ?> ראשונים):</strong>
            <table>
                <tr>
                    <th>שם</th>
                    <th>קוד</th>
                </tr>
                <?php foreach ($sampleMembers as $m): ?>
                <tr>
                    <td><?= sanitize($m['first_name'] . ' ' . $m['last_name']) ?></td>
                    <td style="direction:ltr; font-family:monospace;"><?= sanitize($m['code']) ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>
        <?php endif; ?>

        <?php if (!empty($sampleTickets)): ?>
        <div class="data-preview">
            <strong>דוגמת מצוות (<?= count($sampleTickets) ?> ראשונות):</strong>
            <table>
                <tr>
                    <th>שם</th>
                    <th>קוד</th>
                </tr>
                <?php foreach ($sampleTickets as $t): ?>
                <tr>
                    <td><?= sanitize($t['name']) ?></td>
                    <td style="direction:ltr; font-family:monospace;"><?= sanitize($t['code']) ?></td>
                </tr>
                <?php endforeach; ?>
            </table>
        </div>
        <?php endif; ?>
    </div>

    <div class="test-card">
        <h3><i class="fas fa-file-pdf"></i> יצירת PDF לבדיקה</h3>
        <p>לחץ על אחד הכפתורים ליצירת PDF עם הנתונים של המשתמש לעיל:</p>

        <div style="margin-top: 15px;">
            <a href="../api/generate-labels-pdf.php?user_id=<?= $testUser['id'] ?>&type=members&limit=4"
               target="_blank" class="btn-test primary">
                <i class="fas fa-file-pdf"></i> 4 מתפללים
            </a>

            <a href="../api/generate-labels-pdf.php?user_id=<?= $testUser['id'] ?>&type=members&limit=8"
               target="_blank" class="btn-test primary">
                <i class="fas fa-file-pdf"></i> 8 מתפללים (2 שורות)
            </a>

            <a href="../api/generate-labels-pdf.php?user_id=<?= $testUser['id'] ?>&type=mitzvot&limit=6"
               target="_blank" class="btn-test success">
                <i class="fas fa-file-pdf"></i> 6 מצוות
            </a>

            <a href="../api/generate-labels-pdf.php?user_id=<?= $testUser['id'] ?>&type=members&limit=32"
               target="_blank" class="btn-test purple">
                <i class="fas fa-file-pdf"></i> דף מלא (32)
            </a>
        </div>
    </div>
    <?php else: ?>
    <div class="test-card">
        <div class="status error">
            <i class="fas fa-exclamation-triangle"></i>
            לא נמצאו משתמשים עם נתונים לבדיקה. הוסף מתפללים או מצוות למשתמש כלשהו.
        </div>
    </div>
    <?php endif; ?>

    <div class="test-card">
        <h3><i class="fas fa-info-circle"></i> איך לבדוק</h3>
        <ol style="line-height: 2;">
            <li>ודא שה-TCPDF ו-generate-labels-pdf.php מסומנים בירוק למעלה</li>
            <li>לחץ על אחד מכפתורי ה-PDF</li>
            <li>בדוק את ה-PDF שנוצר:
                <ul>
                    <li>האם המיקום נכון? (4 בשורה, RTL)</li>
                    <li>האם יש QR code?</li>
                    <li>האם העברית מוצגת נכון?</li>
                    <li>האם הצבעים נכונים? (מצוות - רקע בהיר, מתפללים - רקע כהה)</li>
                </ul>
            </li>
        </ol>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
