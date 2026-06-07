<?php
/**
 * Admin Panel - Products Management
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
    $db->prepare("DELETE FROM products WHERE id = ?")->execute([$id]);
    redirect('products.php?msg=deleted');
}

// Handle form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = sanitize($_POST['name'] ?? '');
    $description = sanitize($_POST['description'] ?? '');
    $price = (float)($_POST['price'] ?? 0);
    $currency = sanitize($_POST['currency'] ?? '₪');
    $isMainPackage = isset($_POST['is_main_package']) ? 1 : 0;
    $includes = sanitize($_POST['includes'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);
    $isActive = isset($_POST['is_active']) ? 1 : 0;

    // Handle image upload
    $image = $_POST['current_image'] ?? '';
    if (!empty($_FILES['image']['name'])) {
        $uploadDir = UPLOADS_DIR . '/products/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        $filename = time() . '_' . basename($_FILES['image']['name']);
        $uploadPath = $uploadDir . $filename;
        if (move_uploaded_file($_FILES['image']['tmp_name'], $uploadPath)) {
            $image = 'uploads/products/' . $filename;
        }
    }

    if (empty($name)) {
        $error = 'נא להזין שם מוצר';
    } else {
        try {
            if ($editId) {
                $stmt = $db->prepare("UPDATE products SET name=?, description=?, price=?, currency=?, image=?, is_main_package=?, includes=?, sort_order=?, is_active=? WHERE id=?");
                $stmt->execute([$name, $description, $price, $currency, $image, $isMainPackage, $includes, $sortOrder, $isActive, $editId]);
                $success = 'המוצר עודכן בהצלחה!';
            } else {
                $stmt = $db->prepare("INSERT INTO products (name, description, price, currency, image, is_main_package, includes, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?,?)");
                $stmt->execute([$name, $description, $price, $currency, $image, $isMainPackage, $includes, $sortOrder, $isActive]);
                $success = 'המוצר נוסף בהצלחה!';
            }
            redirect('products.php?msg=saved');
        } catch (Exception $e) {
            $error = 'שגיאה בשמירת המוצר';
        }
    }
}

// Get product for editing
$product = null;
if ($editId) {
    $stmt = $db->prepare("SELECT * FROM products WHERE id = ?");
    $stmt->execute([$editId]);
    $product = $stmt->fetch();
    $action = 'edit';
}

// Get all products
$products = $db->query("SELECT * FROM products ORDER BY is_main_package DESC, sort_order ASC")->fetchAll();

// Show message
if (isset($_GET['msg'])) {
    $success = $_GET['msg'] === 'saved' ? 'השינויים נשמרו!' : 'המוצר נמחק!';
}

$pageTitle = "ניהול מוצרים";
include 'includes/header.php';
?>

<div class="products-page">
    <?php if ($action === 'list'): ?>
        <!-- Products List -->
        <div class="table-container">
            <div class="table-header">
                <h2><i class="fas fa-box"></i> מוצרים</h2>
                <a href="?action=add" class="btn btn-primary">
                    <i class="fas fa-plus"></i> הוסף מוצר
                </a>
            </div>

            <?php if ($success): ?>
                <div class="alert alert-success" style="margin: 20px;"><?= $success ?></div>
            <?php endif; ?>

            <table>
                <thead>
                    <tr>
                        <th>תמונה</th>
                        <th>שם</th>
                        <th>מחיר</th>
                        <th>סוג</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($products as $p): ?>
                    <tr>
                        <td>
                            <?php if ($p['image']): ?>
                                <img src="<?= SITE_URL ?>/<?= $p['image'] ?>" alt="" style="width:50px;height:50px;object-fit:cover;border-radius:8px;">
                            <?php else: ?>
                                <i class="fas fa-image" style="font-size:2rem;color:#ccc;"></i>
                            <?php endif; ?>
                        </td>
                        <td><strong><?= sanitize($p['name']) ?></strong></td>
                        <td><?= $p['currency'] . number_format($p['price']) ?></td>
                        <td>
                            <?php if ($p['is_main_package']): ?>
                                <span style="background:#28a745;color:white;padding:3px 10px;border-radius:20px;font-size:0.85rem;">חבילה ראשית</span>
                            <?php else: ?>
                                <span style="background:#6c757d;color:white;padding:3px 10px;border-radius:20px;font-size:0.85rem;">מוצר נלווה</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ($p['is_active']): ?>
                                <span style="color:#28a745;"><i class="fas fa-check-circle"></i> פעיל</span>
                            <?php else: ?>
                                <span style="color:#dc3545;"><i class="fas fa-times-circle"></i> לא פעיל</span>
                            <?php endif; ?>
                        </td>
                        <td class="table-actions">
                            <a href="?action=edit&id=<?= $p['id'] ?>" class="btn btn-sm btn-primary">
                                <i class="fas fa-edit"></i>
                            </a>
                            <a href="?delete=<?= $p['id'] ?>" class="btn btn-sm btn-danger"
                               onclick="return confirm('למחוק את המוצר?')">
                                <i class="fas fa-trash"></i>
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

    <?php else: ?>
        <!-- Add/Edit Form -->
        <div class="form-card">
            <h2>
                <i class="fas fa-<?= $editId ? 'edit' : 'plus' ?>"></i>
                <?= $editId ? 'עריכת מוצר' : 'הוספת מוצר חדש' ?>
            </h2>

            <?php if ($error): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <form method="POST" enctype="multipart/form-data">
                <input type="hidden" name="current_image" value="<?= sanitize($product['image'] ?? '') ?>">

                <div class="form-row">
                    <div class="form-group">
                        <label for="name">שם המוצר *</label>
                        <input type="text" id="name" name="name" required
                               value="<?= sanitize($product['name'] ?? '') ?>">
                    </div>

                    <div class="form-group">
                        <label for="price">מחיר</label>
                        <input type="number" id="price" name="price" step="0.01"
                               value="<?= $product['price'] ?? 0 ?>">
                    </div>

                    <div class="form-group">
                        <label for="currency">מטבע</label>
                        <select id="currency" name="currency">
                            <option value="₪" <?= ($product['currency'] ?? '₪') === '₪' ? 'selected' : '' ?>>₪ שקל</option>
                            <option value="$" <?= ($product['currency'] ?? '') === '$' ? 'selected' : '' ?>>$ דולר</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="description">תיאור</label>
                    <textarea id="description" name="description" rows="3"><?= sanitize($product['description'] ?? '') ?></textarea>
                </div>

                <div class="form-group">
                    <label for="includes">מה כולל (הפרד עם |)</label>
                    <textarea id="includes" name="includes" rows="3"
                              placeholder="פריט 1|פריט 2|פריט 3"><?= sanitize($product['includes'] ?? '') ?></textarea>
                </div>

                <div class="form-group">
                    <label for="image">תמונה</label>
                    <input type="file" id="image" name="image" accept="image/*">
                    <?php if (!empty($product['image'])): ?>
                        <img src="<?= SITE_URL ?>/<?= $product['image'] ?>" class="file-preview" alt="">
                    <?php endif; ?>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="sort_order">סדר תצוגה</label>
                        <input type="number" id="sort_order" name="sort_order"
                               value="<?= $product['sort_order'] ?? 0 ?>">
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_main_package"
                                   <?= !empty($product['is_main_package']) ? 'checked' : '' ?>>
                            חבילה ראשית
                        </label>
                    </div>

                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_active"
                                   <?= ($product['is_active'] ?? 1) ? 'checked' : '' ?>>
                            פעיל
                        </label>
                    </div>
                </div>

                <div style="display:flex;gap:10px;">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> שמור
                    </button>
                    <a href="products.php" class="btn btn-secondary">
                        <i class="fas fa-arrow-right"></i> חזרה
                    </a>
                </div>
            </form>
        </div>
    <?php endif; ?>
</div>

<?php include 'includes/footer.php'; ?>
