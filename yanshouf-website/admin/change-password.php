<?php
/**
 * Admin Panel - Change Password
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$success = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $currentPassword = $_POST['current_password'] ?? '';
    $newPassword = $_POST['new_password'] ?? '';
    $confirmPassword = $_POST['confirm_password'] ?? '';

    // Get current admin
    $stmt = $db->prepare("SELECT * FROM admins WHERE id = ?");
    $stmt->execute([$_SESSION['admin_id']]);
    $admin = $stmt->fetch();

    if (empty($currentPassword) || empty($newPassword) || empty($confirmPassword)) {
        $error = 'נא למלא את כל השדות';
    } elseif (!password_verify($currentPassword, $admin['password'])) {
        $error = 'הסיסמה הנוכחית שגויה';
    } elseif (strlen($newPassword) < 6) {
        $error = 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים';
    } elseif ($newPassword !== $confirmPassword) {
        $error = 'הסיסמאות החדשות אינן תואמות';
    } else {
        $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $db->prepare("UPDATE admins SET password = ? WHERE id = ?");
        $stmt->execute([$hashedPassword, $_SESSION['admin_id']]);
        $success = 'הסיסמה שונתה בהצלחה!';
    }
}

$pageTitle = "שינוי סיסמה";
include 'includes/header.php';
?>

<div class="change-password-page">
    <div class="form-card" style="max-width: 500px;">
        <h2><i class="fas fa-key"></i> שינוי סיסמה</h2>

        <?php if ($success): ?>
            <div class="alert alert-success"><?= $success ?></div>
        <?php endif; ?>

        <?php if ($error): ?>
            <div class="alert alert-error"><?= $error ?></div>
        <?php endif; ?>

        <form method="POST">
            <div class="form-group">
                <label for="current_password">סיסמה נוכחית</label>
                <input type="password" id="current_password" name="current_password" required>
            </div>

            <div class="form-group">
                <label for="new_password">סיסמה חדשה</label>
                <input type="password" id="new_password" name="new_password" required minlength="6">
                <small style="color:#666;">לפחות 6 תווים</small>
            </div>

            <div class="form-group">
                <label for="confirm_password">אימות סיסמה חדשה</label>
                <input type="password" id="confirm_password" name="confirm_password" required>
            </div>

            <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> שנה סיסמה
            </button>
        </form>
    </div>
</div>

<?php include 'includes/footer.php'; ?>
