<?php
/**
 * Sync API
 * Main endpoint for syncing app data between devices
 */

require_once __DIR__ . '/config.php';

$user = authenticateToken();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'full';

switch ($method) {
    case 'GET':
        handleGetData($user, $action);
        break;
    case 'POST':
        handleSyncData($user);
        break;
    default:
        jsonError('Method not allowed', 405);
}

/**
 * Get all data for user
 */
function handleGetData($user, $action) {
    $db = getDB();
    $userId = $user['id'];

    $data = [
        'members' => [],
        'tickets' => [],
        'links' => [],
        'weeks' => [],
        'drafts' => [],
        'lastSyncAt' => $user['last_sync_at'],
        'serverTime' => date('Y-m-d H:i:s')
    ];

    // Get members
    $stmt = $db->prepare("SELECT id, code, first_name, last_name, phone, email, notes, notification_preferences, created_at, updated_at FROM app_members WHERE user_id = ?");
    $stmt->execute([$userId]);
    $data['members'] = $stmt->fetchAll();

    // Get tickets
    $stmt = $db->prepare("SELECT id, code, name, price, notes, available_on_holidays, holidays_only, created_at FROM app_tickets WHERE user_id = ?");
    $stmt->execute([$userId]);
    $data['tickets'] = $stmt->fetchAll();

    // Get weeks
    $stmt = $db->prepare("SELECT id, week_number, year, parasha_name_he, parasha_name_en, parasha_ref, shabbat_date, is_current, event_type, holiday_name_he, holiday_name_en, created_at FROM app_weeks WHERE user_id = ?");
    $stmt->execute([$userId]);
    $data['weeks'] = $stmt->fetchAll();

    // Get links
    $stmt = $db->prepare("SELECT id, member_id, ticket_id, week_number, year, bid_price, payment_status, reminder_sent_at, linked_at FROM app_links WHERE user_id = ?");
    $stmt->execute([$userId]);
    $data['links'] = $stmt->fetchAll();

    // Get drafts
    $stmt = $db->prepare("SELECT draft_id, data, created_at, created_on_device FROM app_drafts WHERE user_id = ?");
    $stmt->execute([$userId]);
    $drafts = $stmt->fetchAll();
    $data['drafts'] = array_map(function($d) {
        return [
            'id' => $d['draft_id'],
            'data' => json_decode($d['data'], true),
            'createdAt' => $d['created_at'],
            'createdOnDevice' => $d['created_on_device']
        ];
    }, $drafts);

    // Update last sync time
    $db->prepare("UPDATE app_users SET last_sync_at = NOW() WHERE id = ?")->execute([$userId]);

    logApiRequest($userId, 'sync/get', 'GET', null, 200);

    jsonResponse([
        'success' => true,
        'data' => $data
    ]);
}

/**
 * Sync data from app to server
 */
function handleSyncData($user) {
    $input = getJsonInput();
    $db = getDB();
    $userId = $user['id'];

    $result = [
        'membersAdded' => 0,
        'membersUpdated' => 0,
        'ticketsAdded' => 0,
        'ticketsUpdated' => 0,
        'linksAdded' => 0,
        'weeksAdded' => 0,
        'draftsAdded' => 0
    ];

    try {
        $db->beginTransaction();

        // Sync members
        if (isset($input['members']) && is_array($input['members'])) {
            foreach ($input['members'] as $member) {
                $existing = $db->prepare("SELECT id FROM app_members WHERE user_id = ? AND code = ?");
                $existing->execute([$userId, $member['code']]);

                if ($existing->fetch()) {
                    // Update
                    $stmt = $db->prepare("UPDATE app_members SET first_name = ?, last_name = ?, phone = ?, email = ?, notes = ?, notification_preferences = ?, updated_at = NOW() WHERE user_id = ? AND code = ?");
                    $stmt->execute([
                        $member['first_name'],
                        $member['last_name'],
                        $member['phone'] ?? null,
                        $member['email'] ?? null,
                        $member['notes'] ?? null,
                        $member['notification_preferences'] ?? null,
                        $userId,
                        $member['code']
                    ]);
                    $result['membersUpdated']++;
                } else {
                    // Insert
                    $stmt = $db->prepare("INSERT INTO app_members (user_id, code, first_name, last_name, phone, email, notes, notification_preferences, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $userId,
                        $member['code'],
                        $member['first_name'],
                        $member['last_name'],
                        $member['phone'] ?? null,
                        $member['email'] ?? null,
                        $member['notes'] ?? null,
                        $member['notification_preferences'] ?? null,
                        $member['created_at'] ?? date('Y-m-d H:i:s')
                    ]);
                    $result['membersAdded']++;
                }
            }
        }

        // Sync tickets
        if (isset($input['tickets']) && is_array($input['tickets'])) {
            foreach ($input['tickets'] as $ticket) {
                $existing = $db->prepare("SELECT id FROM app_tickets WHERE user_id = ? AND code = ?");
                $existing->execute([$userId, $ticket['code']]);

                if ($existing->fetch()) {
                    // Update
                    $stmt = $db->prepare("UPDATE app_tickets SET name = ?, price = ?, notes = ?, available_on_holidays = ?, holidays_only = ? WHERE user_id = ? AND code = ?");
                    $stmt->execute([
                        $ticket['name'],
                        $ticket['price'] ?? 0,
                        $ticket['notes'] ?? null,
                        $ticket['available_on_holidays'] ?? 1,
                        $ticket['holidays_only'] ?? 0,
                        $userId,
                        $ticket['code']
                    ]);
                    $result['ticketsUpdated']++;
                } else {
                    // Insert
                    $stmt = $db->prepare("INSERT INTO app_tickets (user_id, code, name, price, notes, available_on_holidays, holidays_only, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $userId,
                        $ticket['code'],
                        $ticket['name'],
                        $ticket['price'] ?? 0,
                        $ticket['notes'] ?? null,
                        $ticket['available_on_holidays'] ?? 1,
                        $ticket['holidays_only'] ?? 0,
                        $ticket['created_at'] ?? date('Y-m-d H:i:s')
                    ]);
                    $result['ticketsAdded']++;
                }
            }
        }

        // Sync weeks
        if (isset($input['weeks']) && is_array($input['weeks'])) {
            foreach ($input['weeks'] as $week) {
                $existing = $db->prepare("SELECT id FROM app_weeks WHERE user_id = ? AND week_number = ? AND year = ?");
                $existing->execute([$userId, $week['week_number'], $week['year']]);

                if (!$existing->fetch()) {
                    $stmt = $db->prepare("INSERT INTO app_weeks (user_id, week_number, year, parasha_name_he, parasha_name_en, parasha_ref, shabbat_date, is_current, event_type, holiday_name_he, holiday_name_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $userId,
                        $week['week_number'],
                        $week['year'],
                        $week['parasha_name_he'] ?? null,
                        $week['parasha_name_en'] ?? null,
                        $week['parasha_ref'] ?? null,
                        $week['shabbat_date'] ?? null,
                        $week['is_current'] ?? 0,
                        $week['event_type'] ?? 'shabbat',
                        $week['holiday_name_he'] ?? null,
                        $week['holiday_name_en'] ?? null
                    ]);
                    $result['weeksAdded']++;
                }
            }
        }

        // Sync links - need to map codes to IDs
        if (isset($input['links']) && is_array($input['links'])) {
            foreach ($input['links'] as $link) {
                // Get member ID by code
                $memberStmt = $db->prepare("SELECT id FROM app_members WHERE user_id = ? AND code = ?");
                $memberStmt->execute([$userId, $link['member_code']]);
                $member = $memberStmt->fetch();

                // Get ticket ID by code
                $ticketStmt = $db->prepare("SELECT id FROM app_tickets WHERE user_id = ? AND code = ?");
                $ticketStmt->execute([$userId, $link['ticket_code']]);
                $ticket = $ticketStmt->fetch();

                if ($member && $ticket) {
                    $existing = $db->prepare("SELECT id FROM app_links WHERE user_id = ? AND member_id = ? AND ticket_id = ? AND week_number = ? AND year = ?");
                    $existing->execute([$userId, $member['id'], $ticket['id'], $link['week_number'], $link['year']]);
                    $existingLink = $existing->fetch();

                    if ($existingLink) {
                        // Update existing link (bid_price, payment_status may have changed)
                        $bidPrice = $link['bid_price'] ?? 0;
                        $paymentStatus = $link['payment_status'] ?? 'unpaid';
                        $stmt = $db->prepare("UPDATE app_links SET bid_price = ?, payment_status = ? WHERE id = ?");
                        $stmt->execute([
                            $bidPrice,
                            $paymentStatus,
                            $existingLink['id']
                        ]);
                        if (!isset($result['linksUpdated'])) $result['linksUpdated'] = 0;
                        $result['linksUpdated']++;
                        // Debug: Track updated bid prices
                        if (!isset($result['debug_prices'])) $result['debug_prices'] = [];
                        $result['debug_prices'][] = ['link_id' => $existingLink['id'], 'bid_price' => $bidPrice];
                    } else {
                        // Insert new link
                        $stmt = $db->prepare("INSERT INTO app_links (user_id, member_id, ticket_id, week_number, year, bid_price, payment_status, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $userId,
                            $member['id'],
                            $ticket['id'],
                            $link['week_number'],
                            $link['year'],
                            $link['bid_price'] ?? 0,
                            $link['payment_status'] ?? 'unpaid',
                            $link['linked_at'] ?? date('Y-m-d H:i:s')
                        ]);
                        $result['linksAdded']++;
                    }
                }
            }
        }

        // Sync drafts
        if (isset($input['drafts']) && is_array($input['drafts'])) {
            foreach ($input['drafts'] as $draft) {
                $existing = $db->prepare("SELECT id FROM app_drafts WHERE user_id = ? AND draft_id = ?");
                $existing->execute([$userId, $draft['id']]);

                if (!$existing->fetch()) {
                    $stmt = $db->prepare("INSERT INTO app_drafts (user_id, draft_id, data, created_at, created_on_device) VALUES (?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $userId,
                        $draft['id'],
                        json_encode($draft['data'] ?? $draft),
                        $draft['createdAt'] ?? date('Y-m-d H:i:s'),
                        $draft['createdOnDevice'] ?? null
                    ]);
                    $result['draftsAdded']++;
                }
            }
        }

        // Update last sync time
        $db->prepare("UPDATE app_users SET last_sync_at = NOW() WHERE id = ?")->execute([$userId]);

        $db->commit();

        logApiRequest($userId, 'sync/post', 'POST', ['counts' => $result], 200);

        jsonResponse([
            'success' => true,
            'result' => $result,
            'serverTime' => date('Y-m-d H:i:s')
        ]);

    } catch (Exception $e) {
        $db->rollBack();
        logApiRequest($userId, 'sync/post', 'POST', null, 500);
        jsonError('Sync failed: ' . $e->getMessage(), 500);
    }
}
