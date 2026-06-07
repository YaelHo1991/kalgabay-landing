<?php
/**
 * Members API
 * CRUD operations for members
 */

require_once __DIR__ . '/config.php';

$user = authenticateToken();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'list' || empty($action)) {
            listMembers($user);
        } elseif ($action === 'get' && isset($_GET['id'])) {
            getMember($user, (int)$_GET['id']);
        } else {
            jsonError('Invalid action', 400);
        }
        break;
    case 'POST':
        createMember($user);
        break;
    case 'PUT':
        if (isset($_GET['id'])) {
            updateMember($user, (int)$_GET['id']);
        } else {
            jsonError('Missing member ID', 400);
        }
        break;
    case 'DELETE':
        if (isset($_GET['id'])) {
            deleteMember($user, (int)$_GET['id']);
        } else {
            jsonError('Missing member ID', 400);
        }
        break;
    default:
        jsonError('Method not allowed', 405);
}

/**
 * List all members for user
 */
function listMembers($user) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_members WHERE user_id = ? ORDER BY first_name, last_name");
    $stmt->execute([$user['id']]);
    $members = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'members' => $members
    ]);
}

/**
 * Get single member
 */
function getMember($user, $id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_members WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    $member = $stmt->fetch();

    if (!$member) {
        jsonError('Member not found', 404);
    }

    jsonResponse([
        'success' => true,
        'member' => $member
    ]);
}

/**
 * Create new member
 */
function createMember($user) {
    $input = getJsonInput();
    $db = getDB();

    // Validate required fields
    if (empty($input['first_name'])) {
        jsonError('First name is required', 400);
    }

    // Use manual code if provided, otherwise generate unique code
    if (!empty($input['code'])) {
        $code = $input['code'];
        // Check if code already exists for this user
        $stmt = $db->prepare("SELECT id FROM app_members WHERE user_id = ? AND code = ?");
        $stmt->execute([$user['id'], $code]);
        if ($stmt->fetch()) {
            jsonError('קוד זה כבר קיים במערכת', 400);
        }
    } else {
        $code = 'M' . str_pad($user['id'], 6, '0', STR_PAD_LEFT) . '_' . bin2hex(random_bytes(4));
    }

    $stmt = $db->prepare("INSERT INTO app_members (user_id, code, first_name, last_name, phone, email, notes, notification_preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
    $stmt->execute([
        $user['id'],
        $code,
        $input['first_name'],
        $input['last_name'] ?? '',
        $input['phone'] ?? null,
        $input['email'] ?? null,
        $input['notes'] ?? null,
        $input['notification_preferences'] ?? null
    ]);

    $memberId = $db->lastInsertId();

    // Fetch the created member
    $stmt = $db->prepare("SELECT * FROM app_members WHERE id = ?");
    $stmt->execute([$memberId]);
    $member = $stmt->fetch();

    logApiRequest($user['id'], 'members/create', 'POST', ['member_id' => $memberId], 201);

    jsonResponse([
        'success' => true,
        'member' => $member
    ], 201);
}

/**
 * Update member
 */
function updateMember($user, $id) {
    $input = getJsonInput();
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_members WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Member not found', 404);
    }

    $stmt = $db->prepare("UPDATE app_members SET first_name = ?, last_name = ?, phone = ?, email = ?, notes = ?, notification_preferences = ?, updated_at = NOW() WHERE id = ? AND user_id = ?");
    $stmt->execute([
        $input['first_name'] ?? '',
        $input['last_name'] ?? '',
        $input['phone'] ?? null,
        $input['email'] ?? null,
        $input['notes'] ?? null,
        $input['notification_preferences'] ?? null,
        $id,
        $user['id']
    ]);

    // Fetch updated member
    $stmt = $db->prepare("SELECT * FROM app_members WHERE id = ?");
    $stmt->execute([$id]);
    $member = $stmt->fetch();

    logApiRequest($user['id'], 'members/update', 'PUT', ['member_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'member' => $member
    ]);
}

/**
 * Delete member
 */
function deleteMember($user, $id) {
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_members WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Member not found', 404);
    }

    // Delete associated links first
    $stmt = $db->prepare("DELETE FROM app_links WHERE member_id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);

    // Delete member
    $stmt = $db->prepare("DELETE FROM app_members WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);

    logApiRequest($user['id'], 'members/delete', 'DELETE', ['member_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'message' => 'Member deleted'
    ]);
}
