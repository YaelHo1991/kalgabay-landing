<?php
/**
 * Admin Panel - Features Management
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$success = '';
$error = '';
$action = $_GET['action'] ?? 'list';
$editId = $_GET['id'] ?? null;

// Available icons
$availableIcons = [
    'qrcode' => 'QR Code',
    'users' => 'משתמשים',
    'gavel' => 'פטיש',
    'chart-line' => 'גרף',
    'whatsapp' => 'WhatsApp',
    'cloud' => 'ענן',
    'mobile-alt' => 'מובייל',
    'sync' => 'סנכרון',
    'print' => 'הדפסה',
    'calendar' => 'לוח שנה',
    'bell' => 'התראות',
    'shield-alt' => 'אבטחה',
    'credit-card' => 'תשלום',
    'envelope' => 'מייל',
    'cog' => 'הגדרות'
];

// Handle delete
if (isset($_GET['delete'])) {
    $id = (int)$_GET['delete'];
    $db->prepare("DELETE FROM features WHERE id = ?")->execute([$id]);
    redirect('features.php?msg=deleted');
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $icon = sanitize($_POST['icon'] ?? '');
    $title = sanitize($_POST['title'] ?? '');
    $description = sanitize($_POST['description'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);
    $isActive = isset($_POST['is_active']) ? 1 : 0;

    if (empty($title)) {
        $error = 'נא להזין כותרת';
    } else {
        try {
            if ($editId) {
                $stmt = $db->prepare("UPDATE features SET icon=?, title=?, description=?, sort_order=?, is_active=? WHERE id=?");
                $stmt->execute([$icon, $title, $description, $sortOrder, $isActive, $editId]);
            } else {
                $stmt = $db->prepare("INSERT INTO features (icon, title, description, sort_order, is_active) VALUES (?,?,?,?,?)");
                $stmt->execute([$icon, $title, $description, $sortOrder, $isActive]);
            }
            redirect('features.php?msg=saved');
        } catch (Exception $e) {
            $error = 'שגיאה בשמירה';
        }
    }
}

// Get item for editing
$item = null;
if ($editId) {
    $stmt = $db->prepare("SELECT * FROM features WHERE id = ?");
    $stmt->execute([$editId]);
    $item = $stmt->fetch();
    $action = 'edit';
}

// Get all features
$features = $db->query("SELECT * FROM features ORDER BY sort_order ASC")->fetchAll();

if (isset($_GET['msg'])) {
    $success = $_GET['msg'] === 'saved' ? 'השינויים נשמרו!' : 'התכונה נמחקה!';
}

$pageTitle = "תכונות";
include 'includes/header.php';
?>

<div class="features-page">
    <?php if ($action === 'list'): ?>
        <div class="table-container">
            <div class="table-header">
                <h2><i class="fas fa-star"></i> תכונות</h2>
                <a href="?action=add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> הוסף תכונה
                </a>
            </div>

            <?php if ($success): ?>
                <div class="alert alert-success" style="margin: 20px;"><?= $success ?></div>
            <?php endif; ?>

            <table>
                <thead>
                    <tr>
                        <th>אייקון</th>
                        <th>כותרת</th>
                        <th>תיאור</th>
                        <th>סדר</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($features as $f): ?>
                    <tr>
                        <td>
                            <i class="fas fa-<?= sanitize($f['icon']) ?>" style="font-size:1.5rem;color:#1E5AA8;"></i>
                        </td>
                        <td><strong><?= sanitize($f['title']) ?></strong></td>
                        <td style="max-width:300px;"><?= sanitize($f['description']) ?></td>
                        <td><?= $f['sort_order'] ?></td>
                        <td>
                            <?php if ($f['is_active']): ?>
                                <span style="color:#28a745;"><i class="fas fa-check-circle"></i></span>
                            <?php else: ?>
                                <span style="color:#dc3545;"><i class="fas fa-times-circle"></i></span>
                            <?php endif; ?>
                        </td>
                        <td class="table-actions">
                            <a href="?action=edit&id=<?= $f['id'] ?>" class="btn btn-sm btn-primary">
                                <i class="fas fa-edit"></i>
                            </a>
                            <a href="?delete=<?= $f['id'] ?>" class="btn btn-sm btn-danger"
                               onclick="return confirm('למחוק את התכונה?')">
                                <i class="fas fa-trash"></i>
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

    <?php else: ?>
        <div class="form-card">
            <h2>
                <i class="fas fa-<?= $editId ? 'edit' : 'plus' ?>"></i>
                <?= $editId ? 'עריכת תכונה' : 'הוספת תכונה חדשה' ?>
            </h2>

            <?php if ($error): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <form method="POST">
                <div class="form-row">
                    <div class="form-group">
                        <label for="icon">אייקון</label>
                        <select id="icon" name="icon">
                            <?php foreach ($availableIcons as $iconKey => $iconName): ?>
                                <option value="<?= $iconKey ?>" <?= ($item['icon'] ?? '') === $iconKey ? 'selected' : '' ?>>
                                    <?= $iconName ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p style="margin-top:10px;">
                            תצוגה מקדימה: <i class="fas fa-<?= $item['icon'] ?? 'qrcode' ?>" id="icon-preview" style="font-size:1.5rem;color:#1E5AA8;"></i>
                        </p>
                    </div>

                    <div class="form-group">
                        <label for="title">כותרת *</label>
                        <input type="text" id="title" name="title" required
                               value="<?= sanitize($item['title'] ?? '') ?>">
                    </div>
                </div>

                <div class="form-group">
                    <label for="description">תיאור</label>
                    <textarea id="description" name="description" rows="3"><?= sanitize($item['description'] ?? '') ?></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="sort_order">סדר תצוגה</label>
                        <input type="number" id="sort_order" name="sort_order"
                               value="<?= $item['sort_order'] ?? 0 ?>">
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
                    <a href="features.php" class="btn btn-secondary">
                        <i class="fas fa-arrow-right"></i> חזרה
                    </a>
                </div>
            </form>
        </div>

        <script>
            document.getElementById('icon').addEventListener('change', function() {
                document.getElementById('icon-preview').className = 'fas fa-' + this.value;
            });
        </script>
    <?php endif; ?>
</div>

<?php include 'includes/footer.php'; ?>
