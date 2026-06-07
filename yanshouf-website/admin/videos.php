<?php
/**
 * Admin Panel - Videos Management
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
    $db->prepare("DELETE FROM videos WHERE id = ?")->execute([$id]);
    redirect('videos.php?msg=deleted');
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $title = sanitize($_POST['title'] ?? '');
    $description = sanitize($_POST['description'] ?? '');
    $videoType = sanitize($_POST['video_type'] ?? 'youtube');
    $videoId = sanitize($_POST['video_id'] ?? '');
    $isMain = isset($_POST['is_main']) ? 1 : 0;
    $isActive = isset($_POST['is_active']) ? 1 : 0;
    $sortOrder = (int)($_POST['sort_order'] ?? 0);

    // Handle uploaded video file
    if ($videoType === 'upload' && isset($_FILES['video_file']) && $_FILES['video_file']['error'] === UPLOAD_ERR_OK) {
        $allowedExt = ['mp4', 'webm', 'ogg'];
        $ext = strtolower(pathinfo($_FILES['video_file']['name'], PATHINFO_EXTENSION));

        if (in_array($ext, $allowedExt)) {
            $fileName = 'video_' . time() . '_' . uniqid() . '.' . $ext;
            $targetPath = __DIR__ . '/../uploads/videos/' . $fileName;

            // Create videos directory if not exists
            if (!is_dir(__DIR__ . '/../uploads/videos')) {
                mkdir(__DIR__ . '/../uploads/videos', 0755, true);
            }

            if (move_uploaded_file($_FILES['video_file']['tmp_name'], $targetPath)) {
                $videoId = 'uploads/videos/' . $fileName;
            } else {
                $error = 'שגיאה בהעלאת הסרטון';
            }
        } else {
            $error = 'סוג קובץ לא נתמך. השתמש ב-MP4, WebM או OGG';
        }
    }

    if (empty($title)) {
        $error = 'נא להזין כותרת';
    } elseif (empty($videoId) && !$error) {
        $error = 'נא להזין מזהה סרטון או להעלות קובץ';
    } elseif (!$error) {
        try {
            // If setting as main, unset other main videos
            if ($isMain) {
                $db->exec("UPDATE videos SET is_main = 0");
            }

            if ($editId) {
                // If uploading new video, delete old one
                if ($videoType === 'upload' && isset($_FILES['video_file']) && $_FILES['video_file']['error'] === UPLOAD_ERR_OK) {
                    $oldVideo = $db->prepare("SELECT video_id, video_type FROM videos WHERE id = ?");
                    $oldVideo->execute([$editId]);
                    $old = $oldVideo->fetch();
                    if ($old && $old['video_type'] === 'upload' && file_exists(__DIR__ . '/../' . $old['video_id'])) {
                        unlink(__DIR__ . '/../' . $old['video_id']);
                    }
                }

                $stmt = $db->prepare("UPDATE videos SET title=?, description=?, video_type=?, video_id=?, is_main=?, is_active=?, sort_order=? WHERE id=?");
                $stmt->execute([$title, $description, $videoType, $videoId, $isMain, $isActive, $sortOrder, $editId]);
            } else {
                $stmt = $db->prepare("INSERT INTO videos (title, description, video_type, video_id, is_main, is_active, sort_order) VALUES (?,?,?,?,?,?,?)");
                $stmt->execute([$title, $description, $videoType, $videoId, $isMain, $isActive, $sortOrder]);
            }
            redirect('videos.php?msg=saved');
        } catch (Exception $e) {
            $error = 'שגיאה בשמירה';
        }
    }
}

// Get item for editing
$item = null;
if ($editId) {
    $stmt = $db->prepare("SELECT * FROM videos WHERE id = ?");
    $stmt->execute([$editId]);
    $item = $stmt->fetch();
    $action = 'edit';
}

// Get all videos
$videos = $db->query("SELECT * FROM videos ORDER BY is_main DESC, sort_order ASC")->fetchAll();

if (isset($_GET['msg'])) {
    $success = $_GET['msg'] === 'saved' ? 'השינויים נשמרו!' : 'הסרטון נמחק!';
}

$pageTitle = "סרטונים";
include 'includes/header.php';
?>

<div class="videos-page">
    <?php if ($action === 'list'): ?>
        <div class="table-container">
            <div class="table-header">
                <h2><i class="fas fa-video"></i> סרטונים</h2>
                <a href="?action=add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> הוסף סרטון
                </a>
            </div>

            <?php if ($success): ?>
                <div class="alert alert-success" style="margin: 20px;"><?= $success ?></div>
            <?php endif; ?>

            <table>
                <thead>
                    <tr>
                        <th>תצוגה</th>
                        <th>כותרת</th>
                        <th>סוג</th>
                        <th>ראשי</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($videos as $v): ?>
                    <tr>
                        <td>
                            <?php if ($v['video_type'] === 'youtube'): ?>
                                <img src="https://img.youtube.com/vi/<?= $v['video_id'] ?>/default.jpg"
                                     style="width:80px;border-radius:5px;">
                            <?php else: ?>
                                <i class="fas fa-video" style="font-size:2rem;color:#ccc;"></i>
                            <?php endif; ?>
                        </td>
                        <td><strong><?= sanitize($v['title']) ?></strong></td>
                        <td>
                            <?= $v['video_type'] === 'youtube' ? 'YouTube' : ($v['video_type'] === 'vimeo' ? 'Vimeo' : 'העלאה') ?>
                        </td>
                        <td>
                            <?php if ($v['is_main']): ?>
                                <span style="background:#28a745;color:white;padding:3px 10px;border-radius:20px;font-size:0.85rem;">ראשי</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ($v['is_active']): ?>
                                <span style="color:#28a745;"><i class="fas fa-check-circle"></i></span>
                            <?php else: ?>
                                <span style="color:#dc3545;"><i class="fas fa-times-circle"></i></span>
                            <?php endif; ?>
                        </td>
                        <td class="table-actions">
                            <a href="?action=edit&id=<?= $v['id'] ?>" class="btn btn-sm btn-primary">
                                <i class="fas fa-edit"></i>
                            </a>
                            <a href="?delete=<?= $v['id'] ?>" class="btn btn-sm btn-danger"
                               onclick="return confirm('למחוק את הסרטון?')">
                                <i class="fas fa-trash"></i>
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($videos)): ?>
                    <tr>
                        <td colspan="6" style="text-align:center;padding:40px;color:#666;">
                            <i class="fas fa-video" style="font-size:3rem;margin-bottom:15px;display:block;"></i>
                            אין סרטונים. לחץ על "הוסף סרטון" להוספת סרטון חדש.
                        </td>
                    </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

    <?php else: ?>
        <div class="form-card">
            <h2>
                <i class="fas fa-<?= $editId ? 'edit' : 'plus' ?>"></i>
                <?= $editId ? 'עריכת סרטון' : 'הוספת סרטון חדש' ?>
            </h2>

            <?php if ($error): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <form method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="title">כותרת *</label>
                    <input type="text" id="title" name="title" required
                           value="<?= sanitize($item['title'] ?? '') ?>">
                </div>

                <div class="form-group">
                    <label for="description">תיאור</label>
                    <textarea id="description" name="description" rows="2"><?= sanitize($item['description'] ?? '') ?></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="video_type">סוג סרטון</label>
                        <select id="video_type" name="video_type" onchange="toggleVideoInput()">
                            <option value="youtube" <?= ($item['video_type'] ?? 'youtube') === 'youtube' ? 'selected' : '' ?>>YouTube</option>
                            <option value="vimeo" <?= ($item['video_type'] ?? '') === 'vimeo' ? 'selected' : '' ?>>Vimeo</option>
                            <option value="upload" <?= ($item['video_type'] ?? '') === 'upload' ? 'selected' : '' ?>>העלאה לשרת</option>
                        </select>
                    </div>
                </div>

                <div id="external-video-input" class="form-group">
                    <label for="video_id">מזהה סרטון</label>
                    <input type="text" id="video_id" name="video_id"
                           placeholder="dQw4w9WgXcQ"
                           value="<?= ($item['video_type'] ?? '') !== 'upload' ? sanitize($item['video_id'] ?? '') : '' ?>">
                    <small style="color:#666;">
                        YouTube: הקוד שמופיע אחרי v= בכתובת (למשל: youtube.com/watch?v=<strong>dQw4w9WgXcQ</strong>)
                    </small>
                </div>

                <div id="upload-video-input" class="form-group" style="display:none;">
                    <?php if (($item['video_type'] ?? '') === 'upload' && !empty($item['video_id'])): ?>
                    <div style="margin-bottom:15px;padding:15px;background:#e8f5e9;border-radius:8px;">
                        <i class="fas fa-check-circle" style="color:#28a745;"></i>
                        סרטון קיים: <?= basename($item['video_id']) ?>
                        <br><small style="color:#666;">העלה קובץ חדש להחלפה, או השאר ריק לשמירת הקיים</small>
                    </div>
                    <?php endif; ?>
                    <label for="video_file">העלה קובץ סרטון (MP4, WebM, OGG)</label>
                    <input type="file" id="video_file" name="video_file" accept=".mp4,.webm,.ogg">
                    <small style="color:#666;">
                        מומלץ: MP4 בפורמט H.264 לתאימות מרבית. שים לב למגבלת גודל הקובץ בשרת.
                    </small>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="sort_order">סדר תצוגה</label>
                        <input type="number" id="sort_order" name="sort_order"
                               value="<?= $item['sort_order'] ?? 0 ?>">
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_main"
                                   <?= !empty($item['is_main']) ? 'checked' : '' ?>>
                            סרטון ראשי (יוצג בדף הנחיתה)
                        </label>
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_active"
                                   <?= ($item['is_active'] ?? 1) ? 'checked' : '' ?>>
                            פעיל
                        </label>
                    </div>
                </div>

                <div style="display:flex;gap:10px;">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> שמור
                    </button>
                    <a href="videos.php" class="btn btn-secondary">
                        <i class="fas fa-arrow-right"></i> חזרה
                    </a>
                </div>
            </form>
        </div>
    <?php endif; ?>
</div>

<script>
function toggleVideoInput() {
    const videoType = document.getElementById('video_type').value;
    const externalInput = document.getElementById('external-video-input');
    const uploadInput = document.getElementById('upload-video-input');

    if (videoType === 'upload') {
        externalInput.style.display = 'none';
        uploadInput.style.display = 'block';
        document.getElementById('video_id').removeAttribute('required');
    } else {
        externalInput.style.display = 'block';
        uploadInput.style.display = 'none';
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', toggleVideoInput);
</script>

<?php include 'includes/footer.php'; ?>
