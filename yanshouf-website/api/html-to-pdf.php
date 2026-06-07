<?php
/**
 * HTML to PDF Converter
 *
 * This endpoint receives the exact same HTML that the app generates
 * and converts it to PDF using dompdf.
 *
 * This ensures 100% match with what the app produces on desktop.
 */

// Allow CORS for app access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

// Load dompdf
$dompdfAutoload = __DIR__ . '/../lib/dompdf-master/autoload.inc.php';
if (!file_exists($dompdfAutoload)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'dompdf library not found. Please upload lib/dompdf-master folder.']);
    exit;
}

require_once $dompdfAutoload;

use Dompdf\Dompdf;
use Dompdf\Options;

try {
    // Get input
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        throw new Exception('Invalid JSON input');
    }

    $html = $input['html'] ?? null;
    $filename = $input['filename'] ?? 'labels-' . date('Y-m-d') . '.pdf';
    $returnBase64 = $input['returnBase64'] ?? false;

    if (!$html) {
        throw new Exception('No HTML provided');
    }

    // Wrap HTML in a complete document if it's not already
    if (stripos($html, '<!DOCTYPE') === false && stripos($html, '<html') === false) {
        $html = '<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: A4;
            margin: 0;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: "Segoe UI", Tahoma, Arial, sans-serif;
            direction: rtl;
        }
    </style>
</head>
<body>' . $html . '</body>
</html>';
    }

    // Configure dompdf
    $options = new Options();
    $options->set('isRemoteEnabled', true); // Allow loading images from data URLs
    $options->set('isHtml5ParserEnabled', true);
    $options->set('defaultFont', 'DejaVu Sans'); // Has Hebrew support
    $options->set('dpi', 96); // Match browser DPI

    // Create dompdf instance
    $dompdf = new Dompdf($options);

    // Load HTML
    $dompdf->loadHtml($html, 'UTF-8');

    // Set paper size to A4
    $dompdf->setPaper('A4', 'portrait');

    // Render PDF
    $dompdf->render();

    // Get PDF content
    $pdfContent = $dompdf->output();

    // Return response
    if ($returnBase64) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => true,
            'pdf' => base64_encode($pdfContent),
            'filename' => $filename
        ]);
    } else {
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfContent));
        echo $pdfContent;
    }

} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
