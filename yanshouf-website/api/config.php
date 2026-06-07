<?php
/**
 * API Configuration
 */

require_once __DIR__ . '/../config.php';

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Token');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * Send JSON response
 */
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send error response
 */
function jsonError($message, $code = 400) {
    jsonResponse(['success' => false, 'error' => $message], $code);
}

/**
 * Get JSON input
 */
function getJsonInput() {
    $input = file_get_contents('php://input');
    return json_decode($input, true) ?? [];
}

/**
 * Authenticate user by API token
 */
function authenticateToken() {
    $token = null;

    // Check Authorization header
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        if (preg_match('/Bearer\s+(.+)/', $headers['Authorization'], $matches)) {
            $token = $matches[1];
        }
    }

    // Check X-API-Token header
    if (!$token && isset($headers['X-API-Token'])) {
        $token = $headers['X-API-Token'];
    }

    // Check query parameter
    if (!$token && isset($_GET['token'])) {
        $token = $_GET['token'];
    }

    if (!$token) {
        jsonError('Missing authentication token', 401);
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM app_users WHERE api_token = ? AND status IN ('trial', 'active')");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonError('Invalid or expired token', 401);
    }

    // Check if subscription is valid
    if ($user['status'] === 'trial' && $user['trial_ends_at'] && strtotime($user['trial_ends_at']) < time()) {
        // Trial expired
        $db->prepare("UPDATE app_users SET status = 'expired' WHERE id = ?")->execute([$user['id']]);
        jsonError('Trial period has expired', 403);
    }

    if ($user['status'] === 'active' && $user['subscription_expires_at'] && strtotime($user['subscription_expires_at']) < time()) {
        // Subscription expired
        $db->prepare("UPDATE app_users SET status = 'expired' WHERE id = ?")->execute([$user['id']]);
        jsonError('Subscription has expired', 403);
    }

    // Update last login
    $db->prepare("UPDATE app_users SET last_login_at = NOW() WHERE id = ?")->execute([$user['id']]);

    return $user;
}

/**
 * Generate secure API token
 */
function generateApiToken() {
    return bin2hex(random_bytes(32));
}

/**
 * Log API request
 */
function logApiRequest($userId, $endpoint, $method, $requestData = null, $responseCode = 200) {
    try {
        $db = getDB();
        $stmt = $db->prepare("INSERT INTO app_api_logs (user_id, endpoint, method, request_data, response_code, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $userId,
            $endpoint,
            $method,
            $requestData ? json_encode($requestData) : null,
            $responseCode,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null
        ]);
    } catch (Exception $e) {
        // Silent fail - logging should not break the API
    }
}
