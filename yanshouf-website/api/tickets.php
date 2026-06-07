<?php
/**
 * Tickets (Mitzvot) API
 * CRUD operations for tickets/mitzvot
 */

require_once __DIR__ . '/config.php';

$user = authenticateToken();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'list' || empty($action)) {
            listTickets($user);
        } elseif ($action === 'get' && isset($_GET['id'])) {
            getTicket($user, (int)$_GET['id']);
        } else {
            jsonError('Invalid action', 400);
        }
        break;
    case 'POST':
        createTicket($user);
        break;
    case 'PUT':
        if (isset($_GET['id'])) {
            updateTicket($user, (int)$_GET['id']);
        } else {
            jsonError('Missing ticket ID', 400);
        }
        break;
    case 'DELETE':
        if (isset($_GET['id'])) {
            deleteTicket($user, (int)$_GET['id']);
        } else {
            jsonError('Missing ticket ID', 400);
        }
        break;
    default:
        jsonError('Method not allowed', 405);
}

/**
 * List all tickets for user
 */
function listTickets($user) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_tickets WHERE user_id = ? ORDER BY name");
    $stmt->execute([$user['id']]);
    $tickets = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'tickets' => $tickets
    ]);
}

/**
 * Get single ticket
 */
function getTicket($user, $id) {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_tickets WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    $ticket = $stmt->fetch();

    if (!$ticket) {
        jsonError('Ticket not found', 404);
    }

    jsonResponse([
        'success' => true,
        'ticket' => $ticket
    ]);
}

/**
 * Create new ticket
 */
function createTicket($user) {
    $input = getJsonInput();
    $db = getDB();

    // Validate required fields
    if (empty($input['name'])) {
        jsonError('Name is required', 400);
    }

    // Use manual code if provided, otherwise generate unique code
    if (!empty($input['code'])) {
        $code = $input['code'];
        // Check if code already exists for this user
        $stmt = $db->prepare("SELECT id FROM app_tickets WHERE user_id = ? AND code = ?");
        $stmt->execute([$user['id'], $code]);
        if ($stmt->fetch()) {
            jsonError('קוד זה כבר קיים במערכת', 400);
        }
    } else {
        $code = 'T' . str_pad($user['id'], 6, '0', STR_PAD_LEFT) . '_' . bin2hex(random_bytes(4));
    }

    $stmt = $db->prepare("INSERT INTO app_tickets (user_id, code, name, price, notes, available_on_holidays, holidays_only, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
    $stmt->execute([
        $user['id'],
        $code,
        $input['name'],
        $input['price'] ?? 0,
        $input['notes'] ?? null,
        $input['available_on_holidays'] ?? 1,
        $input['holidays_only'] ?? 0
    ]);

    $ticketId = $db->lastInsertId();

    // Fetch the created ticket
    $stmt = $db->prepare("SELECT * FROM app_tickets WHERE id = ?");
    $stmt->execute([$ticketId]);
    $ticket = $stmt->fetch();

    logApiRequest($user['id'], 'tickets/create', 'POST', ['ticket_id' => $ticketId], 201);

    jsonResponse([
        'success' => true,
        'ticket' => $ticket
    ], 201);
}

/**
 * Update ticket
 */
function updateTicket($user, $id) {
    $input = getJsonInput();
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_tickets WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Ticket not found', 404);
    }

    $stmt = $db->prepare("UPDATE app_tickets SET name = ?, price = ?, notes = ?, available_on_holidays = ?, holidays_only = ? WHERE id = ? AND user_id = ?");
    $stmt->execute([
        $input['name'] ?? '',
        $input['price'] ?? 0,
        $input['notes'] ?? null,
        $input['available_on_holidays'] ?? 1,
        $input['holidays_only'] ?? 0,
        $id,
        $user['id']
    ]);

    // Fetch updated ticket
    $stmt = $db->prepare("SELECT * FROM app_tickets WHERE id = ?");
    $stmt->execute([$id]);
    $ticket = $stmt->fetch();

    logApiRequest($user['id'], 'tickets/update', 'PUT', ['ticket_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'ticket' => $ticket
    ]);
}

/**
 * Delete ticket
 */
function deleteTicket($user, $id) {
    $db = getDB();

    // Check ownership
    $stmt = $db->prepare("SELECT id FROM app_tickets WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);
    if (!$stmt->fetch()) {
        jsonError('Ticket not found', 404);
    }

    // Delete associated links first
    $stmt = $db->prepare("DELETE FROM app_links WHERE ticket_id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);

    // Delete ticket
    $stmt = $db->prepare("DELETE FROM app_tickets WHERE id = ? AND user_id = ?");
    $stmt->execute([$id, $user['id']]);

    logApiRequest($user['id'], 'tickets/delete', 'DELETE', ['ticket_id' => $id], 200);

    jsonResponse([
        'success' => true,
        'message' => 'Ticket deleted'
    ]);
}
