<?php
/**
 * Admin Panel - Downloads Management
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$success = '';
$error = '';
$action = $_GET['action'] ?? 'list';
$editId = $_GET['id'] ?? null;

// Handle delete
if (isset($_GET['delete'])) {
    $id = (int)$_GET['delete'];
    // Get file path before deleting
    $stmt = $db->prepare("SELECT file_path FROM downloads WHERE id = ?");
    $stmt->execute([$id]);
    $file = $stmt->fetch();
    if ($file && file_exists(__DIR__ . '/../' . $file['file_path'])) {
        unlink(__DIR__ . '/../' . $file['file_path']);
    }
    $db->prepare("DELETE FROM downloads WHERE id = ?")->execute([$id]);
    redirect('downloads.php?msg=deleted');
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = sanitize($_POST['name'] ?? '');
    $platform = sanitize($_POST['platform'] ?? 'other');
    $version = sanitize($_POST['version'] ?? '');
    $isActive = isset($_POST['is_active']) ? 1 : 0;

    // Handle file upload
    $filePath = $_POST['current_file'] ?? '';
    $fileSize = $_POST['current_size'] ?? '';

    if (!empty($_FILES['file']['name'])) {
        $uploadDir = UPLOADS_DIR . '/downloads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $originalName = basename($_FILES['file']['name']);
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        $filename = $platform . '_v' . str_replace('.', '-', $version) . '_' . time() . '.' . $extension;
        $uploadPath = $uploadDir . $filename;

        if (move_uploaded_file($_FILES['file']['tmp_name'], $uploadPath)) {
            $filePath = 'uploads/downloads/' . $filename;
            $fileSize = formatFileSize($_FILES['file']['size']);
        } else {
            $error = 'שגיאה בהעלאת הקובץ';
        }
    }

    if (empty($name)) {
        $error = 'נא להזין שם';
    } elseif (empty($filePath) && !$editId) {
        $error = 'נא להעלות קובץ';
    } else {
        try {
            if ($editId) {
                $stmt = $db->prepare("UPDATE downloads SET name=?, platform=?, version=?, file_path=?, file_size=?, is_active=? WHERE id=?");
                $stmt->execute([$name, $platform, $version, $filePath, $fileSize, $isActive, $editId]);
            } else {
                $stmt = $db->prepare("INSERT INTO downloads (name, platform, version, file_path, file_size, is_active) VALUES (?,?,?,?,?,?)");
                $stmt->execute([$name, $platform, $version, $filePath, $fileSize, $isActive]);
            }
            redirect('downloads.php?msg=saved');
        } catch (Exception $e) {
            $error = 'שגיאה בשמירה';
        }
    }
}

function formatFileSize($bytes) {
    if ($bytes >= 1073741824) {
        return number_format($bytes / 1073741824, 2) . ' GB';
    } elseif ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 2) . ' MB';
    } elseif ($bytes >= 1024) {
        return number_format($bytes / 1024, 2) . ' KB';
    } else {
        return $bytes . ' bytes';
    }
}

// Get item for editing
$item = null;
if ($editId) {
    $stmt = $db->prepare("SELECT * FROM downloads WHERE id = ?");
    $stmt->execute([$editId]);
    $item = $stmt->fetch();
    $action = 'edit';
}

// Get all downloads
$downloads = $db->query("SELECT * FROM downloads ORDER BY platform, created_at DESC")->fetchAll();

if (isset($_GET['msg'])) {
    $success = $_GET['msg'] === 'saved' ? 'השינויים נשמרו!' : 'הקובץ נמחק!';
}

$pageTitle = "קבצים להורדה";
include 'includes/header.php';
?>

<div class="downloads-page">
    <?php if ($action === 'list'): ?>
        <div class="table-container">
            <div class="table-header">
                <h2><i class="fas fa-download"></i> קבצים להורדה</h2>
                <a href="?action=add" class="btn btn-primary">
                    <i class="fas fa-upload"></i> העלה קובץ
                </a>
            </div>

            <?php if ($success): ?>
                <div class="alert alert-success" style="margin: 20px;"><?= $success ?></div>
            <?php endif; ?>

            <table>
                <thead>
                    <tr>
                        <th>שם</th>
                        <th>פלטפורמה</th>
                        <th>גרסה</th>
                        <th>גודל</th>
                        <th>הורדות</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($downloads as $d): ?>
                    <tr>
                        <td><strong><?= sanitize($d['name']) ?></strong></td>
                        <td>
                            <?php
                            $icons = ['windows' => 'fab fa-windows', 'android' => 'fab fa-android', 'ios' => 'fab fa-apple'];
                            $icon = $icons[$d['platform']] ?? 'fas fa-file';
                            ?>
                            <i class="<?= $icon ?>"></i> <?= ucfirst($d['platform']) ?>
                        </td>
                        <td><?= sanitize($d['version']) ?></td>
                        <td><?= sanitize($d['file_size']) ?></td>
                        <td><?= number_format($d['download_count']) ?></td>
                        <td>
                            <?php if ($d['is_active']): ?>
                                <span style="color:#28a745;"><i class="fas fa-check-circle"></i> פעיל</span>
                            <?php else: ?>
                                <span style="color:#dc3545;"><i class="fas fa-times-circle"></i> לא פעיל</span>
                            <?php endif; ?>
                        </td>
                        <td class="table-actions">
                            <a href="<?= SITE_URL ?>/<?= $d['file_path'] ?>" target="_blank" class="btn btn-sm btn-success">
                                <i class="fas fa-download"></i>
                            </a>
                            <a href="?action=edit&id=<?= $d['id'] ?>" class="btn btn-sm btn-primary">
                                <i class="fas fa-edit"></i>
                            </a>
                            <a href="?delete=<?= $d['id'] ?>" class="btn btn-sm btn-danger"
                               onclick="return confirm('למחוק את הקובץ?')">
                                <i class="fas fa-trash"></i>
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($downloads)): ?>
                    <tr>
                        <td colspan="7" style="text-align:center;padding:40px;color:#666;">
                            <i class="fas fa-cloud-upload-alt" style="font-size:3rem;margin-bottom:15px;display:block;"></i>
                            אין קבצים להורדה. לחץ על "העלה קובץ" להוספת קובץ חדש.
                        </td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

    <?php else: ?>
        <div class="form-card">
            <h2>
                <i class="fas fa-<?= $editId ? 'edit' : 'upload' ?>"></i>
                <?= $editId ? 'עריכת קובץ' : 'העלאת קובץ חדש' ?>
            </h2>

            <?php if ($error): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <form method="POST" enctype="multipart/form-data">
                <input type="hidden" name="current_file" value="<?= sanitize($item['file_path'] ?? '') ?>">
                <input type="hidden" name="current_size" value="<?= sanitize($item['file_size'] ?? '') ?>">

                <div class="form-row">
                    <div class="form-group">
                        <label for="name">שם הקובץ *</label>
                        <input type="text" id="name" name="name" required
                               placeholder="למשל: KalGabay Windows"
                               value="<?= sanitize($item['name'] ?? '') ?>">
                    </div>

                    <div class="form-group">
                        <label for="platform">פלטפורמה *</label>
                        <select id="platform" name="platform" required>
                            <option value="windows" <?= ($item['platform'] ?? '') === 'windows' ? 'selected' : '' ?>>Windows</option>
                            <option value="android" <?= ($item['platform'] ?? '') === 'android' ? 'selected' : '' ?>>Android</option>
                            <option value="ios" <?= ($item['platform'] ?? '') === 'ios' ? 'selected' : '' ?>>iOS</option>
                            <option value="other" <?= ($item['platform'] ?? '') === 'other' ? 'selected' : '' ?>>אחר</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="version">גרסה</label>
                        <input type="text" id="version" name="version"
                               placeholder="1.0.0"
                               value="<?= sanitize($item['version'] ?? '') ?>">
                    </div>
                </div>

                <div class="form-group">
                    <label for="file">קובץ <?= $editId ? '(השאר ריק לשמירת הקובץ הנוכחי)' : '*' ?></label>
                    <input type="file" id="file" name="file" <?= $editId ? '' : 'required' ?>>
                    <?php if (!empty($item['file_path'])): ?>
                        <p style="margin-top:10px;color:#666;">
                            <i class="fas fa-file"></i> קובץ נוכחי: <?= basename($item['file_path']) ?> (<?= $item['file_size'] ?>)
                        </p>
                    <?php endif; ?>
                </div>

                <div class="form-group">
                    <label>
                        <input type="checkbox" name="is_active"
                               <?= ($item['is_active'] ?? 1) ? 'checked' : '' ?>>
                        פעיל (יוצג באתר)
                    </label>
                </div>

                <div style="display:flex;gap:10px;">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> שמור
                    </button>
                    <a href="downloads.php" class="btn btn-secondary">
                        <i class="fas fa-arrow-right"></i> חזרה
                    </a>
                </div>
            </form>
        </div>
    <?php endif; ?>
</div>

<?php include 'includes/footer.php'; ?>
