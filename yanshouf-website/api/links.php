<?php
/**
 * Links API
 * CRUD operations for member-ticket links (who bought which mitzvah)
 */

require_once __DIR__ . '/config.php';

$user = authenticateToken();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'list' || empty($action)) {
            listLinks($user);
        } elseif ($action === 'get' && isset($_GET['id'])) {
            getLink($user, (int)$_GET['id']);
        } elseif ($action === 'by-member' && isset($_GET['member_id'])) {
            getLinksByMember($user, (int)$_GET['member_id']);
        } elseif ($action === 'by-ticket' && isset($_GET['ticket_id'])) {
            getLinksByTicket($user, (int)$_GET['ticket_id']);
        } else {
            jsonError('Invalid action', 400);
        }
        break;
    case 'POST':
        createLink($user);
        break;
    case 'PUT':
        if (isset($_GET['id'])) {
            updateLink($user, (int)$_GET['id']);
        } else {
            jsonError('Missing link ID', 400);
        }
        break;
    case 'DELETE':
        if (isset($_GET['id'])) {
            deleteLink($user, (int)$_GET['id']);
        } else {
            jsonError('Missing link ID', 400);
        }
        break;
    default:
        jsonError('Method not allowed', 405);
}

/**
 * List all links for user
 */
function listLinks($user) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT l.*,
               m.first_name as member_first_name,
               m.last_name as member_last_name,
               t.name as ticket_name
        FROM app_links l
        LEFT JOIN app_members m ON l.member_id = m.id
        LEFT JOIN app_tickets t ON l.ticket_id = t.id
        WHERE l.user_id = ?
        ORDER BY l.date DESC, l.created_at DESC
    ");
    $stmt->execute([$user['id']]);
    $links = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'links' => $links
    ]);
}

/**
 * Get single link
 */
function getLink($user, $id) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT l.*,
               m.first_name as member_first_name,
               m.last_name as member_last_name,
               t.name as ticket_name
        FROM app_links l
        LEFT JOIN app_members m ON l.member_id = m.id
        LEFT JOIN app_tickets t ON l.ticket_id = t.id
        WHERE l.id = ? AND l.user_id = ?
    ");
    $stmt->execute([$id, $user['id']]);
    $link = $stmt->fetch();

    if (!$link) {
        jsonError('Link not found', 404);
    }

    jsonResponse([
        'success' => true,
        'link' => $link
    ]);
}

/**
 * Get links by member
 */
function getLinksByMember($user, $memberId) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT l.*, t.name as ticket_name
        FROM app_links l
        LEFT JOIN app_tickets t ON l.ticket_id = t.id
        WHERE l.member_id = ? AND l.user_id = ?
        ORDER BY l.date DESC
    ");
    $stmt->execute([$memberId, $user['id']]);
    $links = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'links' => $links
    ]);
}

/**
 * Get links by ticket
 */
function getLinksByTicket($user, $ticketId) {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT l.*,
               m.first_name as member_first_name,
               m.last_name as member_last_name
        FROM app_links l
        LEFT JOIN app_members m ON l.member_id = m.id
        WHERE l.ticket_id = ? AND l.user_id = ?
        ORDER BY l.date DESC
    ");
    $stmt->execute([$ticketId, $user['id']]);
    $links = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'links' => $links
    ]);
}

/**
 * Create new link
 */
function createLink($user) {
    $input = getJsonInput();
    $db = getDB();

    // Validate required fields
    if (empty($input['member_id']) || empty($input['ticket_id'])) {
        jsonError('Member ID and Ticket ID are required', 400);
    }

    // Verify member belongs to user
    $stmt = $db->prepare("SELECT id FROM app_members WHERE id = ? AND user_id = ?");
    $stmt->execute([$input['member_id'], $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Member not found', 404);
    }

    // Verify ticket belongs to user
    $stmt = $db->prepare("SELECT id FROM app_tickets WHERE id = ? AND user_id = ?");
    $stmt->execute([$input['ticket_id'], $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Ticket not found', 404);
    }

    // Generate unique code
    $code = 'L' . str_pad($user['id'], 6, '0', STR_PAD_LEFT) . '_' . bin2hex(random_bytes(4));

    $stmt = $db->prepare("INSERT INTO app_links (user_id, code, member_id, ticket_id, date, price_paid, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
    $stmt->execute([
        $user['id'],
        $code,
        $input['member_id'],
        $input['ticket_id'],
        $input['date'] ?? date('Y-m-d'),
        $input['price_paid'] ?? 0,
        $input['notes'] ?? null
    ]);

    $linkId = $db->lastInsertId();

    // Fetch the created link with joined data
    $stmt = $db->prepare("
        SELECT l.*,
               m.first_name as member_first_name,
               m.last_name as member_last_name,
               t.name as ticket_name
        FROM app_links l
        LEFT JOIN app_members m ON l.member_id = m.id
        LEFT JOIN app_tickets t ON l.ticket_id = t.id
        WHERE l.id = ?
    ");
    $stmt->execute([$linkId]);
    $link = $stmt->fetch();

    logApiRequest($user['id'], 'links/create', 'POST', ['link_id' => $linkId], 201);

    jsonResponse([
        'success' => true,
        'link' => $link
    ], 201);
}

/**
 * Update link
 */
function updateLink($user, $id) {
    $input = getJsonInput();
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_links WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Link not found', 404);
    }

    // If member_id is being updated, verify it belongs to user
    if (!empty($input['member_id'])) {
        $stmt = $db->prepare("SELECT id FROM app_members WHERE id = ? AND user_id = ?");
        $stmt->execute([$input['member_id'], $user['id']]);
        if (!$stmt->fetch()) {
            jsonError('Member not found', 404);
        }
    }

    // If ticket_id is being updated, verify it belongs to user
    if (!empty($input['ticket_id'])) {
        $stmt = $db->prepare("SELECT id FROM app_tickets WHERE id = ? AND user_id = ?");
        $stmt->execute([$input['ticket_id'], $user['id']]);
        if (!$stmt->fetch()) {
            jsonError('Ticket not found', 404);
        }
    }

    $stmt = $db->prepare("UPDATE app_links SET member_id = ?, ticket_id = ?, date = ?, price_paid = ?, notes = ? WHERE id = ? AND user_id = ?");
    $stmt->execute([
        $input['member_id'],
        $input['ticket_id'],
        $input['date'] ?? date('Y-m-d'),
        $input['price_paid'] ?? 0,
        $input['notes'] ?? null,
        $id,
        $user['id']
    ]);

    // Fetch updated link with joined data
    $stmt = $db->prepare("
        SELECT l.*,
               m.first_name as member_first_name,
               m.last_name as member_last_name,
               t.name as ticket_name
        FROM app_links l
        LEFT JOIN app_members m ON l.member_id = m.id
        LEFT JOIN app_tickets t ON l.ticket_id = t.id
        WHERE l.id = ?
    ");
    $stmt->execute([$id]);
    $link = $stmt->fetch();

    logApiRequest($user['id'], 'links/update', 'PUT', ['link_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'link' => $link
    ]);
}

/**
 * Delete link
 */
function deleteLink($user, $id) {
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_links WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Link not found', 404);
    }

    // Delete link
    $stmt = $db->prepare("DELETE FROM app_links WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);

    logApiRequest($user['id'], 'links/delete', 'DELETE', ['link_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'message' => 'Link deleted'
    ]);
}
