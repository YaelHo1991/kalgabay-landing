<?php
/**
 * Admin Panel - App Users Management
 */
require_once __DIR__ . '/../config.php';
requireLogin();

$db = getDB();
$error = '';
$success = '';

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'add_user') {
        $email = trim($_POST['email'] ?? '');
        $password = $_POST['password'] ?? '';
        $synagogueName = trim($_POST['synagogue_name'] ?? '');
        $contactName = trim($_POST['contact_name'] ?? '');
        $phone = trim($_POST['phone'] ?? '');
        $status = $_POST['status'] ?? 'trial';

        if (empty($email) || empty($password) || empty($synagogueName)) {
            $error = 'נא למלא את כל השדות הנדרשים';
        } else {
            // Check if email exists
            $check = $db->prepare("SELECT id FROM app_users WHERE email = ?");
            $check->execute([$email]);
            if ($check->fetch()) {
                $error = 'כתובת האימייל כבר קיימת במערכת';
            } else {
                $passwordHash = password_hash($password, PASSWORD_DEFAULT);
                $token = bin2hex(random_bytes(32));
                $trialEndsAt = date('Y-m-d H:i:s', strtotime('+1 year'));

                $stmt = $db->prepare("INSERT INTO app_users (email, password_hash, synagogue_name, contact_name, phone, status, trial_ends_at, api_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$email, $passwordHash, $synagogueName, $contactName, $phone, $status, $trialEndsAt, $token]);
                $success = 'המשתמש נוסף בהצלחה!';
            }
        }
    } elseif ($action === 'update_status') {
        $userId = (int)$_POST['user_id'];
        $newStatus = $_POST['new_status'];
        $db->prepare("UPDATE app_users SET status = ? WHERE id = ?")->execute([$newStatus, $userId]);
        $success = 'הסטטוס עודכן בהצלחה!';
    } elseif ($action === 'delete_user') {
        $userId = (int)$_POST['user_id'];
        $db->prepare("DELETE FROM app_users WHERE id = ?")->execute([$userId]);
        $success = 'המשתמש נמחק בהצלחה!';
    } elseif ($action === 'reset_password') {
        $userId = (int)$_POST['user_id'];
        $newPassword = $_POST['new_password'];
        $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $db->prepare("UPDATE app_users SET password_hash = ? WHERE id = ?")->execute([$passwordHash, $userId]);
        $success = 'הסיסמה אופסה בהצלחה!';
    }
}

// Get filter
$statusFilter = $_GET['status'] ?? '';
$search = $_GET['search'] ?? '';

// Build query
$where = [];
$params = [];

if ($statusFilter) {
    $where[] = "status = ?";
    $params[] = $statusFilter;
}

if ($search) {
    $where[] = "(email LIKE ? OR synagogue_name LIKE ? OR contact_name LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$whereClause = count($where) > 0 ? "WHERE " . implode(" AND ", $where) : "";

$stmt = $db->prepare("SELECT * FROM app_users $whereClause ORDER BY created_at DESC");
$stmt->execute($params);
$users = $stmt->fetchAll();

// Get stats
$stats = [
    'total' => $db->query("SELECT COUNT(*) FROM app_users")->fetchColumn(),
    'trial' => $db->query("SELECT COUNT(*) FROM app_users WHERE status = 'trial'")->fetchColumn(),
    'active' => $db->query("SELECT COUNT(*) FROM app_users WHERE status = 'active'")->fetchColumn(),
    'expired' => $db->query("SELECT COUNT(*) FROM app_users WHERE status IN ('expired', 'suspended')")->fetchColumn()
];

// View user details
$viewUser = null;
$viewUserData = null;
if (isset($_GET['view'])) {
    $viewId = (int)$_GET['view'];
    $stmt = $db->prepare("SELECT * FROM app_users WHERE id = ?");
    $stmt->execute([$viewId]);
    $viewUser = $stmt->fetch();

    if ($viewUser) {
        // Get user's data counts
        $viewUserData = [
            'members' => $db->prepare("SELECT COUNT(*) FROM app_members WHERE user_id = ?")->execute([$viewId]) ? $db->query("SELECT COUNT(*) FROM app_members WHERE user_id = $viewId")->fetchColumn() : 0,
            'tickets' => $db->prepare("SELECT COUNT(*) FROM app_tickets WHERE user_id = ?")->execute([$viewId]) ? $db->query("SELECT COUNT(*) FROM app_tickets WHERE user_id = $viewId")->fetchColumn() : 0,
            'links' => $db->prepare("SELECT COUNT(*) FROM app_links WHERE user_id = ?")->execute([$viewId]) ? $db->query("SELECT COUNT(*) FROM app_links WHERE user_id = $viewId")->fetchColumn() : 0
        ];

        // Get purchases
        $stmt = $db->prepare("SELECT * FROM app_purchases WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$viewId]);
        $viewUserData['purchases'] = $stmt->fetchAll();
    }
}

$pageTitle = "משתמשים רשומים";
include 'includes/header.php';
?>

<style>
.stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-bottom: 25px;
}
.stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
.stat-card .number {
    font-size: 2.5rem;
    font-weight: bold;
    color: #2563eb;
}
.stat-card .label {
    color: #666;
    margin-top: 5px;
}
.stat-card.trial .number { color: #f59e0b; }
.stat-card.active .number { color: #10b981; }
.stat-card.expired .number { color: #ef4444; }

.filters-bar {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
    align-items: center;
}
.filters-bar input, .filters-bar select {
    padding: 10px 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 1rem;
}
.filters-bar input { flex: 1; min-width: 200px; }

.user-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr auto;
    gap: 15px;
    align-items: center;
    padding: 15px 20px;
    background: white;
    border-radius: 10px;
    margin-bottom: 10px;
    box-shadow: 0 1px 5px rgba(0,0,0,0.05);
}
.user-row:hover { box-shadow: 0 3px 15px rgba(0,0,0,0.1); }

.status-badge {
    padding: 5px 15px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 500;
}
.status-trial { background: #fef3c7; color: #92400e; }
.status-active { background: #d1fae5; color: #065f46; }
.status-expired, .status-suspended { background: #fee2e2; color: #991b1b; }

.action-btn {
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
}
.action-btn.view { background: #e0e7ff; color: #3730a3; }
.action-btn.edit { background: #fef3c7; color: #92400e; }
.action-btn.delete { background: #fee2e2; color: #991b1b; }

.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    justify-content: center;
    align-items: center;
}
.modal.active { display: flex; }
.modal-content {
    background: white;
    border-radius: 15px;
    padding: 30px;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
}
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}
.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
}

.user-detail-card {
    background: white;
    border-radius: 15px;
    padding: 25px;
    margin-bottom: 20px;
}
.user-detail-card h3 {
    margin-bottom: 15px;
    color: #1e40af;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 10px;
}
.detail-row {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid #f3f4f6;
}
.detail-row:last-child { border-bottom: none; }
.detail-label { color: #666; }
.detail-value { font-weight: 500; }
</style>

<div class="users-page">
    <?php if ($error): ?>
        <div class="alert alert-error"><?= $error ?></div>
    <?php endif; ?>
    <?php if ($success): ?>
        <div class="alert alert-success"><?= $success ?></div>
    <?php endif; ?>

    <?php if ($viewUser): ?>
        <!-- User Details View -->
        <div style="margin-bottom: 20px;">
            <a href="users.php" class="btn btn-secondary">
                <i class="fas fa-arrow-right"></i> חזרה לרשימה
            </a>
        </div>

        <div class="user-detail-card">
            <h3><i class="fas fa-synagogue"></i> <?= sanitize($viewUser['synagogue_name']) ?></h3>
            <div class="detail-row">
                <span class="detail-label">אימייל</span>
                <span class="detail-value"><?= sanitize($viewUser['email']) ?></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">איש קשר</span>
                <span class="detail-value"><?= sanitize($viewUser['contact_name']) ?></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">טלפון</span>
                <span class="detail-value"><?= sanitize($viewUser['phone']) ?></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">סטטוס</span>
                <span class="detail-value">
                    <span class="status-badge status-<?= $viewUser['status'] ?>">
                        <?= ['trial' => 'תקופת ניסיון', 'active' => 'פעיל', 'expired' => 'פג תוקף', 'suspended' => 'מושהה'][$viewUser['status']] ?? $viewUser['status'] ?>
                    </span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">תאריך הרשמה</span>
                <span class="detail-value"><?= date('d/m/Y H:i', strtotime($viewUser['created_at'])) ?></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">התחברות אחרונה</span>
                <span class="detail-value"><?= $viewUser['last_login_at'] ? date('d/m/Y H:i', strtotime($viewUser['last_login_at'])) : 'אף פעם' ?></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">סנכרון אחרון</span>
                <span class="detail-value"><?= $viewUser['last_sync_at'] ? date('d/m/Y H:i', strtotime($viewUser['last_sync_at'])) : 'אף פעם' ?></span>
            </div>
            <?php if ($viewUser['status'] === 'trial'): ?>
            <div class="detail-row">
                <span class="detail-label">תקופת ניסיון עד</span>
                <span class="detail-value"><?= date('d/m/Y', strtotime($viewUser['trial_ends_at'])) ?></span>
            </div>
            <?php endif; ?>
        </div>

        <div class="user-detail-card">
            <h3><i class="fas fa-database"></i> נתונים באפליקציה</h3>
            <div class="stats-row" style="margin-bottom:15px;">
                <div class="stat-card">
                    <div class="number"><?= $viewUserData['members'] ?></div>
                    <div class="label">מתפללים</div>
                </div>
                <div class="stat-card">
                    <div class="number"><?= $viewUserData['tickets'] ?></div>
                    <div class="label">מצוות</div>
                </div>
                <div class="stat-card">
                    <div class="number"><?= $viewUserData['links'] ?></div>
                    <div class="label">רכישות מצוות</div>
                </div>
                <div class="stat-card">
                    <div class="number"><?= count($viewUserData['purchases']) ?></div>
                    <div class="label">רכישות מוצרים</div>
                </div>
            </div>
            <!-- PDF Generation Test Buttons -->
            <div style="display: flex; gap: 10px; flex-wrap: wrap; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                <a href="../api/generate-labels-pdf.php?user_id=<?= $viewUser['id'] ?>&type=members&limit=10"
                   target="_blank"
                   class="btn"
                   style="background: #1E5AA8; color: white;">
                    <i class="fas fa-file-pdf"></i> הורד PDF מתפללים (10 ראשונים)
                </a>
                <a href="../api/generate-labels-pdf.php?user_id=<?= $viewUser['id'] ?>&type=mitzvot&limit=10"
                   target="_blank"
                   class="btn"
                   style="background: #10b981; color: white;">
                    <i class="fas fa-file-pdf"></i> הורד PDF מצוות (10 ראשונות)
                </a>
                <a href="../api/generate-labels-pdf.php?user_id=<?= $viewUser['id'] ?>&type=members&limit=32"
                   target="_blank"
                   class="btn"
                   style="background: #6366f1; color: white;">
                    <i class="fas fa-file-pdf"></i> דף מלא מתפללים (32)
                </a>
            </div>
        </div>

        <?php if (!empty($viewUserData['purchases'])): ?>
        <div class="user-detail-card">
            <h3><i class="fas fa-shopping-cart"></i> היסטוריית רכישות</h3>
            <table style="width:100%;">
                <thead>
                    <tr>
                        <th>מוצר</th>
                        <th>סכום</th>
                        <th>סטטוס</th>
                        <th>תאריך</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($viewUserData['purchases'] as $p): ?>
                    <tr>
                        <td><?= sanitize($p['product_name']) ?></td>
                        <td><?= number_format($p['amount'], 2) ?> <?= $p['currency'] ?></td>
                        <td>
                            <span class="status-badge status-<?= $p['payment_status'] === 'completed' ? 'active' : 'trial' ?>">
                                <?= ['pending' => 'ממתין', 'completed' => 'הושלם', 'failed' => 'נכשל', 'refunded' => 'הוחזר'][$p['payment_status']] ?? $p['payment_status'] ?>
                            </span>
                        </td>
                        <td><?= date('d/m/Y', strtotime($p['created_at'])) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>

        <div class="user-detail-card">
            <h3><i class="fas fa-cogs"></i> פעולות</h3>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <form method="POST" style="display:inline;">
                    <input type="hidden" name="action" value="update_status">
                    <input type="hidden" name="user_id" value="<?= $viewUser['id'] ?>">
                    <select name="new_status" onchange="this.form.submit()" style="padding:10px;border-radius:8px;border:1px solid #ddd;">
                        <option value="">שנה סטטוס...</option>
                        <option value="trial">תקופת ניסיון</option>
                        <option value="active">פעיל</option>
                        <option value="suspended">מושהה</option>
                        <option value="expired">פג תוקף</option>
                    </select>
                </form>
                <button onclick="document.getElementById('resetPasswordModal').classList.add('active')" class="btn btn-secondary">
                    <i class="fas fa-key"></i> אפס סיסמה
                </button>
                <form method="POST" style="display:inline;" onsubmit="return confirm('האם למחוק את המשתמש? פעולה זו תמחק את כל הנתונים שלו!')">
                    <input type="hidden" name="action" value="delete_user">
                    <input type="hidden" name="user_id" value="<?= $viewUser['id'] ?>">
                    <button type="submit" class="btn" style="background:#fee2e2;color:#991b1b;">
                        <i class="fas fa-trash"></i> מחק משתמש
                    </button>
                </form>
            </div>
        </div>

        <!-- Reset Password Modal -->
        <div class="modal" id="resetPasswordModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>איפוס סיסמה</h3>
                    <button class="modal-close" onclick="document.getElementById('resetPasswordModal').classList.remove('active')">&times;</button>
                </div>
                <form method="POST">
                    <input type="hidden" name="action" value="reset_password">
                    <input type="hidden" name="user_id" value="<?= $viewUser['id'] ?>">
                    <div class="form-group">
                        <label>סיסמה חדשה</label>
                        <input type="text" name="new_password" required minlength="6" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;margin-top:15px;">
                        <i class="fas fa-save"></i> שמור סיסמה
                    </button>
                </form>
            </div>
        </div>

    <?php else: ?>
        <!-- Users List View -->
        <div class="stats-row">
            <div class="stat-card">
                <div class="number"><?= $stats['total'] ?></div>
                <div class="label">סה"כ משתמשים</div>
            </div>
            <div class="stat-card trial">
                <div class="number"><?= $stats['trial'] ?></div>
                <div class="label">תקופת ניסיון</div>
            </div>
            <div class="stat-card active">
                <div class="number"><?= $stats['active'] ?></div>
                <div class="label">פעילים</div>
            </div>
            <div class="stat-card expired">
                <div class="number"><?= $stats['expired'] ?></div>
                <div class="label">פג תוקף</div>
            </div>
        </div>

        <div class="filters-bar">
            <form method="GET" style="display:contents;">
                <input type="text" name="search" placeholder="חפש לפי שם, אימייל..." value="<?= sanitize($search) ?>">
                <select name="status" onchange="this.form.submit()">
                    <option value="">כל הסטטוסים</option>
                    <option value="trial" <?= $statusFilter === 'trial' ? 'selected' : '' ?>>תקופת ניסיון</option>
                    <option value="active" <?= $statusFilter === 'active' ? 'selected' : '' ?>>פעיל</option>
                    <option value="expired" <?= $statusFilter === 'expired' ? 'selected' : '' ?>>פג תוקף</option>
                    <option value="suspended" <?= $statusFilter === 'suspended' ? 'selected' : '' ?>>מושהה</option>
                </select>
                <button type="submit" class="btn btn-secondary"><i class="fas fa-search"></i> חפש</button>
            </form>
            <button onclick="document.getElementById('addUserModal').classList.add('active')" class="btn btn-primary">
                <i class="fas fa-plus"></i> הוסף משתמש
            </button>
        </div>

        <div class="users-list">
            <?php foreach ($users as $u): ?>
            <div class="user-row">
                <div>
                    <strong><?= sanitize($u['synagogue_name']) ?></strong>
                    <br><small style="color:#666;"><?= sanitize($u['contact_name']) ?></small>
                </div>
                <div>
                    <a href="mailto:<?= sanitize($u['email']) ?>"><?= sanitize($u['email']) ?></a>
                    <?php if ($u['phone']): ?>
                    <br><small><?= sanitize($u['phone']) ?></small>
                    <?php endif; ?>
                </div>
                <div>
                    <span class="status-badge status-<?= $u['status'] ?>">
                        <?= ['trial' => 'ניסיון', 'active' => 'פעיל', 'expired' => 'פג תוקף', 'suspended' => 'מושהה'][$u['status']] ?? $u['status'] ?>
                    </span>
                </div>
                <div>
                    <small>נרשם: <?= date('d/m/Y', strtotime($u['created_at'])) ?></small>
                    <?php if ($u['last_login_at']): ?>
                    <br><small>התחבר: <?= date('d/m/Y', strtotime($u['last_login_at'])) ?></small>
                    <?php endif; ?>
                </div>
                <div>
                    <a href="users.php?view=<?= $u['id'] ?>" class="action-btn view">
                        <i class="fas fa-eye"></i> צפה
                    </a>
                </div>
            </div>
            <?php endforeach; ?>

            <?php if (empty($users)): ?>
            <div style="text-align:center;padding:60px;background:white;border-radius:15px;">
                <i class="fas fa-users" style="font-size:4rem;color:#ddd;margin-bottom:20px;display:block;"></i>
                <p style="color:#666;font-size:1.2rem;">אין משתמשים להצגה</p>
            </div>
            <?php endif; ?>
        </div>

        <!-- Add User Modal -->
        <div class="modal" id="addUserModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-user-plus"></i> הוספת משתמש חדש</h3>
                    <button class="modal-close" onclick="document.getElementById('addUserModal').classList.remove('active')">&times;</button>
                </div>
                <form method="POST">
                    <input type="hidden" name="action" value="add_user">
                    <div class="form-group">
                        <label>שם בית הכנסת *</label>
                        <input type="text" name="synagogue_name" required style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <div class="form-group">
                        <label>אימייל *</label>
                        <input type="email" name="email" required style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <div class="form-group">
                        <label>סיסמה *</label>
                        <input type="text" name="password" required minlength="6" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <div class="form-group">
                        <label>שם איש קשר</label>
                        <input type="text" name="contact_name" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <div class="form-group">
                        <label>טלפון</label>
                        <input type="tel" name="phone" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                    </div>
                    <div class="form-group">
                        <label>סטטוס</label>
                        <select name="status" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;">
                            <option value="trial">תקופת ניסיון (שנה)</option>
                            <option value="active">פעיל</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;margin-top:15px;">
                        <i class="fas fa-save"></i> הוסף משתמש
                    </button>
                </form>
            </div>
        </div>
    <?php endif; ?>
</div>

<script>
// Close modal on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});
</script>

<?php include 'includes/footer.php'; ?>
