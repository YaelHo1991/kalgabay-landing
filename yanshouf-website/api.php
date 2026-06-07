<?php
/**
 * API Endpoint for Landing Page
 * Returns site data as JSON
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$db = getDB();

$response = [];

// Get settings
$settings = [];
$result = $db->query("SELECT setting_key, setting_value FROM site_settings");
while ($row = $result->fetch()) {
    $settings[$row['setting_key']] = $row['setting_value'];
}
$response['settings'] = $settings;

// Get features
$response['features'] = $db->query("SELECT icon, title, description FROM features WHERE is_active = 1 ORDER BY sort_order ASC")->fetchAll();

// Get products
$products = $db->query("SELECT * FROM products WHERE is_active = 1 ORDER BY is_main_package DESC, sort_order ASC")->fetchAll();
$response['mainPackage'] = null;
$response['products'] = [];

foreach ($products as $p) {
    $product = [
        'id' => $p['id'],
        'name' => $p['name'],
        'description' => $p['description'],
        'price' => (float)$p['price'],
        'currency' => $p['currency'],
        'image' => $p['image'] ? SITE_URL . '/' . $p['image'] : null
    ];

    if ($p['is_main_package']) {
        $product['includes'] = $p['includes'] ? explode('|', $p['includes']) : [];
        $response['mainPackage'] = $product;
    } else {
        $response['products'][] = $product;
    }
}

// Get FAQ
$response['faq'] = $db->query("SELECT question, answer FROM faq WHERE is_active = 1 ORDER BY sort_order ASC")->fetchAll();

// Get downloads
$downloads = $db->query("SELECT name, platform, version, file_path, file_size FROM downloads WHERE is_active = 1 ORDER BY platform")->fetchAll();
$response['downloads'] = [];
foreach ($downloads as $d) {
    $response['downloads'][$d['platform']] = [
        'name' => $d['name'],
        'version' => $d['version'],
        'url' => SITE_URL . '/' . $d['file_path'],
        'size' => $d['file_size']
    ];
}

// Get main video
$video = $db->query("SELECT title, description, video_type, video_id FROM videos WHERE is_active = 1 AND is_main = 1 LIMIT 1")->fetch();
$response['video'] = $video ?: null;

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
