<?php
/**
 * Generate Labels PDF
 * Creates sticker labels PDF for members or mitzvot
 * Matching the exact design from the app's pdfGenerator.ts
 *
 * Label Config (Galilyon stickers):
 * - 52.5mm x 35mm per label
 * - 4 columns x 8 rows = 32 labels per A4 page
 * - Top margin: 7mm
 * - Row gap: 1mm
 */

require_once __DIR__ . '/config.php';

// Allow CORS for app access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Label configuration matching the app exactly
const LABEL_CONFIG = [
    'width' => 52.5,      // mm - per label
    'height' => 35,       // mm - per label
    'columns' => 4,
    'rows' => 8,
    'totalLabels' => 32,
    'topMargin' => 7,     // mm - reduced to raise first row
    'bottomMargin' => 8,  // mm
    'leftMargin' => 0,    // mm - full width
    'rowGap' => 1,        // mm between rows
    'pageWidth' => 210,   // A4 width
    'pageHeight' => 297,  // A4 height
];

/**
 * Main PDF generation using TCPDF
 */
function generateLabelsPDF($items, $startPosition, $type, $synagogueName = '') {
    // Check for TCPDF - try multiple locations
    $tcpdfPaths = [
        __DIR__ . '/../lib/TCPDF-main/tcpdf.php',
        __DIR__ . '/../lib/tcpdf/tcpdf.php',
        __DIR__ . '/../vendor/tecnickcom/tcpdf/tcpdf.php',
    ];

    $tcpdfLoaded = false;
    foreach ($tcpdfPaths as $path) {
        if (file_exists($path)) {
            require_once $path;
            $tcpdfLoaded = true;
            break;
        }
    }

    if (!$tcpdfLoaded) {
        throw new Exception('TCPDF library not found. Please upload the lib/TCPDF-main folder to the server.');
    }

    $config = LABEL_CONFIG;

    // Calculate total pages needed
    $lastPosition = $startPosition + count($items) - 1;
    $totalPages = ceil($lastPosition / $config['totalLabels']);

    // Create PDF
    $pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8', false);

    // Set document info
    $pdf->SetCreator('YanShouf');
    $pdf->SetAuthor('YanShouf');
    $pdf->SetTitle('מדבקות - ' . ($type === 'mitzvot' ? 'מצוות' : 'מתפללים'));

    // Remove default header/footer
    $pdf->setPrintHeader(false);
    $pdf->setPrintFooter(false);

    // Set margins to 0 (we handle positioning manually)
    $pdf->SetMargins(0, 0, 0);
    $pdf->SetAutoPageBreak(false);

    // Build position to item map
    $positionToItem = [];
    foreach ($items as $index => $item) {
        $pos = $startPosition + $index;
        $positionToItem[$pos] = $item;
    }

    // Generate pages
    for ($pageNum = 0; $pageNum < $totalPages; $pageNum++) {
        $pdf->AddPage();

        // Draw labels on this page
        for ($posOnPage = 0; $posOnPage < $config['totalLabels']; $posOnPage++) {
            $globalPos = $pageNum * $config['totalLabels'] + $posOnPage + 1;

            if (!isset($positionToItem[$globalPos])) {
                continue; // Empty position
            }

            $item = $positionToItem[$globalPos];
            $row = floor($posOnPage / $config['columns']);
            $col = $config['columns'] - 1 - ($posOnPage % $config['columns']); // RTL

            $x = $config['leftMargin'] + $col * $config['width'];
            $y = $config['topMargin'] + $row * ($config['height'] + $config['rowGap']);

            drawLabel($pdf, $x, $y, $config['width'], $config['height'], $item, $type);
        }
    }

    return $pdf->Output('', 'S'); // Return as string
}

/**
 * Draw a single label - matching app design exactly
 * Based on pdfGenerator.ts generatePDF() function and actual PDF output
 */
function drawLabel($pdf, $x, $y, $width, $height, $item, $type) {
    $isMitzva = ($type === 'mitzvot') || (isset($item['isMitzva']) && $item['isMitzva']);

    // Color schemes matching the app exactly (from actual PDF screenshot)
    if ($isMitzva) {
        // Mitzvot: Light blue/cream gradient background, dark blue text
        // The gradient goes from #E3F2FD (light blue) to #FDF8F0 (cream)
        // Since TCPDF can't do gradients, use a light blue-ish color
        $frameBgColor = [227, 242, 253]; // #E3F2FD - light blue (matches screenshot)
        $borderColor = [30, 90, 168];     // #1E5AA8 - dark blue border
        $textColor = [22, 61, 117];       // #163D75 - dark blue text
        $decorColor = [79, 168, 217];     // #4FA8D9 - light blue decorations
        $decorSymbol = "◇"; // Diamond shape as seen in screenshot
    } else {
        // Members: Dark blue background, light text
        $frameBgColor = [30, 90, 168];    // #1E5AA8
        $borderColor = [79, 168, 217];    // #4FA8D9
        $textColor = [227, 242, 253];     // #E3F2FD
        $decorColor = [79, 168, 217];     // #4FA8D9
        $decorSymbol = "●";
    }

    // === Draw decorative frame around the name ===
    // Frame takes about 90% of label width, positioned at top
    $frameMargin = $width * 0.05; // 5% margin each side
    $frameWidth = $width * 0.9;
    $frameHeight = 9; // mm - slightly taller for better proportions
    $frameX = $x + $frameMargin;
    $frameY = $y + 2; // Small top margin

    // Draw frame background with rounded corners
    $pdf->SetFillColor($frameBgColor[0], $frameBgColor[1], $frameBgColor[2]);
    $pdf->SetDrawColor($borderColor[0], $borderColor[1], $borderColor[2]);
    $pdf->SetLineWidth(0.5); // Thicker border to match screenshot
    $pdf->RoundedRect($frameX, $frameY, $frameWidth, $frameHeight, 1.5, '1111', 'DF');

    // === Draw corner decorations (diamonds) ===
    $pdf->SetTextColor($decorColor[0], $decorColor[1], $decorColor[2]);
    $pdf->SetFont('dejavusans', '', 6);
    // Top right corner
    $pdf->SetXY($frameX + $frameWidth - 4, $frameY + 1);
    $pdf->Cell(3, 3, $decorSymbol, 0, 0, 'C');
    // Top left corner
    $pdf->SetXY($frameX + 1, $frameY + 1);
    $pdf->Cell(3, 3, $decorSymbol, 0, 0, 'C');

    // === Draw name centered in frame ===
    $name = $item['name'] ?? '';
    $nameLen = mb_strlen($name, 'UTF-8');

    // Auto-size font based on name length
    if ($nameLen > 20) {
        $fontSize = 8;
    } elseif ($nameLen > 15) {
        $fontSize = 9;
    } elseif ($nameLen > 10) {
        $fontSize = 10;
    } else {
        $fontSize = 12; // Larger default font
    }

    // Truncate name if too long
    $pdf->SetFont('dejavusans', 'B', $fontSize);
    $maxNameWidth = $frameWidth - 10; // Leave space for decorations
    $originalName = $name;
    while (mb_strlen($name, 'UTF-8') > 3 && $pdf->GetStringWidth($name) > $maxNameWidth) {
        $name = mb_substr($name, 0, -1, 'UTF-8');
    }
    if ($name !== $originalName) {
        $name = mb_substr($name, 0, -1, 'UTF-8') . '...';
    }

    $pdf->SetTextColor($textColor[0], $textColor[1], $textColor[2]);
    // Center name vertically in frame
    $pdf->SetXY($frameX, $frameY + ($frameHeight - $fontSize * 0.35) / 2);
    $pdf->Cell($frameWidth, $fontSize * 0.35, $name, 0, 0, 'C');

    // === Calculate QR position ===
    $qrSize = 16; // mm - larger QR for better scanning (matches screenshot)
    $qrX = $x + ($width - $qrSize) / 2;
    $qrY = $y + $height - $qrSize - 1; // Position at bottom

    // === Draw serial number above QR (for mitzvot) ===
    if (isset($item['serialNumber']) && $item['serialNumber']) {
        $pdf->SetTextColor(51, 51, 51); // Dark gray
        $pdf->SetFont('dejavusans', 'B', 8);
        $serialY = $qrY - 4;
        $pdf->SetXY($x, $serialY);
        $pdf->Cell($width, 4, '#' . $item['serialNumber'], 0, 0, 'C');
    }

    // === Draw QR code ===
    if (isset($item['code']) && $item['code']) {
        $style = [
            'border' => false,
            'padding' => 0,
            'fgcolor' => [0, 0, 0],
            'bgcolor' => false,
        ];
        $pdf->write2DBarcode($item['code'], 'QRCODE,L', $qrX, $qrY, $qrSize, $qrSize, $style, 'N');
    }
}

// Handle request
try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        // Demo/test mode - generate sample PDF
        $userId = $_GET['user_id'] ?? null;
        $type = $_GET['type'] ?? 'members';
        $limit = min((int)($_GET['limit'] ?? 10), 32); // Max 32 labels

        if (!$userId) {
            // Check admin session for demo
            require_once __DIR__ . '/../config.php';
            if (!isLoggedIn()) {
                throw new Exception('Unauthorized - admin login required for demo');
            }

            // Use first user with data for demo
            $db = getDB();
            $stmt = $db->query("SELECT id FROM app_users WHERE id IN (SELECT DISTINCT user_id FROM app_members) LIMIT 1");
            $user = $stmt->fetch();
            if (!$user) {
                throw new Exception('No users with members found');
            }
            $userId = $user['id'];
        }

        $db = getDB();

        // Get items based on type
        if ($type === 'mitzvot') {
            $stmt = $db->prepare("SELECT id, code, name FROM app_tickets WHERE user_id = ? LIMIT ?");
            $stmt->execute([$userId, $limit]);
            $rows = $stmt->fetchAll();

            $items = array_map(function($row, $index) {
                return [
                    'name' => $row['name'],
                    'code' => $row['code'],
                    'serialNumber' => $index + 1,
                    'isMitzva' => true
                ];
            }, $rows, array_keys($rows));
        } else {
            $stmt = $db->prepare("SELECT id, code, first_name, last_name FROM app_members WHERE user_id = ? LIMIT ?");
            $stmt->execute([$userId, $limit]);
            $rows = $stmt->fetchAll();

            $items = array_map(function($row) {
                return [
                    'name' => trim($row['first_name'] . ' ' . $row['last_name']),
                    'code' => $row['code'],
                    'isMitzva' => false
                ];
            }, $rows);
        }

        if (empty($items)) {
            throw new Exception('No ' . ($type === 'mitzvot' ? 'mitzvot' : 'members') . ' found for this user');
        }

        // Generate PDF
        $pdfContent = generateLabelsPDF($items, 1, $type);

        // Output PDF
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="labels-' . $type . '-' . date('Y-m-d') . '.pdf"');
        header('Content-Length: ' . strlen($pdfContent));
        echo $pdfContent;

    } elseif ($method === 'POST') {
        // API mode - receive items from app
        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input) {
            throw new Exception('Invalid JSON input');
        }

        $items = $input['items'] ?? [];
        $startPosition = $input['startPosition'] ?? 1;
        $type = $input['type'] ?? 'members';

        if (empty($items)) {
            throw new Exception('No items provided');
        }

        // Generate PDF
        $pdfContent = generateLabelsPDF($items, $startPosition, $type);

        // Return as base64 or direct download
        if (isset($input['returnBase64']) && $input['returnBase64']) {
            header('Content-Type: application/json');
            echo json_encode([
                'success' => true,
                'pdf' => base64_encode($pdfContent),
                'filename' => 'labels-' . $type . '-' . date('Y-m-d') . '.pdf'
            ]);
        } else {
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="labels-' . $type . '-' . date('Y-m-d') . '.pdf"');
            echo $pdfContent;
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
