<?php
/**
 * Admin Panel - FAQ Management
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
    $db->prepare("DELETE FROM faq WHERE id = ?")->execute([$id]);
    redirect('faq.php?msg=deleted');
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $question = sanitize($_POST['question'] ?? '');
    $answer = sanitize($_POST['answer'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);
    $isActive = isset($_POST['is_active']) ? 1 : 0;

    if (empty($question) || empty($answer)) {
        $error = 'נא למלא את כל השדות';
    } else {
        try {
            if ($editId) {
                $stmt = $db->prepare("UPDATE faq SET question=?, answer=?, sort_order=?, is_active=? WHERE id=?");
                $stmt->execute([$question, $answer, $sortOrder, $isActive, $editId]);
            } else {
                $stmt = $db->prepare("INSERT INTO faq (question, answer, sort_order, is_active) VALUES (?,?,?,?)");
                $stmt->execute([$question, $answer, $sortOrder, $isActive]);
            }
            redirect('faq.php?msg=saved');
        } catch (Exception $e) {
            $error = 'שגיאה בשמירה';
        }
    }
}

// Get item for editing
$item = null;
if ($editId) {
    $stmt = $db->prepare("SELECT * FROM faq WHERE id = ?");
    $stmt->execute([$editId]);
    $item = $stmt->fetch();
    $action = 'edit';
}

// Get all FAQs
$faqs = $db->query("SELECT * FROM faq ORDER BY sort_order ASC")->fetchAll();

if (isset($_GET['msg'])) {
    $success = $_GET['msg'] === 'saved' ? 'השינויים נשמרו!' : 'השאלה נמחקה!';
}

$pageTitle = "שאלות נפוצות";
include 'includes/header.php';
?>

<div class="faq-page">
    <?php if ($action === 'list'): ?>
        <div class="table-container">
            <div class="table-header">
                <h2><i class="fas fa-question-circle"></i> שאלות נפוצות</h2>
                <a href="?action=add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> הוסף שאלה
                </a>
            </div>

            <?php if ($success): ?>
                <div class="alert alert-success" style="margin: 20px;"><?= $success ?></div>
            <?php endif; ?>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>שאלה</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($faqs as $f): ?>
                    <tr>
                        <td><?= $f['sort_order'] ?></td>
                        <td>
                            <strong><?= sanitize($f['question']) ?></strong>
                            <p style="color:#666;font-size:0.9rem;margin-top:5px;">
                                <?= mb_substr(sanitize($f['answer']), 0, 80) ?>...
                            </p>
                        </td>
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
                               onclick="return confirm('למחוק את השאלה?')">
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
                <?= $editId ? 'עריכת שאלה' : 'הוספת שאלה חדשה' ?>
            </h2>

            <?php if ($error): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <form method="POST">
                <div class="form-group">
                    <label for="question">שאלה *</label>
                    <input type="text" id="question" name="question" required
                           value="<?= sanitize($item['question'] ?? '') ?>">
                </div>

                <div class="form-group">
                    <label for="answer">תשובה *</label>
                    <textarea id="answer" name="answer" rows="4" required><?= sanitize($item['answer'] ?? '') ?></textarea>
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
                    <a href="faq.php" class="btn btn-secondary">
                        <i class="fas fa-arrow-right"></i> חזרה
                    </a>
                </div>
            </form>
        </div>
    <?php endif; ?>
</div>

<?php include 'includes/footer.php'; ?>
