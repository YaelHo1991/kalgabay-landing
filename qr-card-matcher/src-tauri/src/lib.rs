use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::OnceLock;
use tauri::Manager;

// Google OAuth constants - loaded from environment or config
static GOOGLE_CLIENT_ID: OnceLock<String> = OnceLock::new();
static GOOGLE_CLIENT_SECRET: OnceLock<String> = OnceLock::new();
const GOOGLE_REDIRECT_URI: &str = "http://localhost:3850/oauth/callback";
const GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/gmail.send";

fn get_client_id() -> &'static str {
    GOOGLE_CLIENT_ID.get_or_init(|| {
        // First try runtime env var, then fall back to build-time value
        std::env::var("GOOGLE_CLIENT_ID")
            .unwrap_or_else(|_| env!("GOOGLE_CLIENT_ID").to_string())
    })
}

fn get_client_secret() -> &'static str {
    GOOGLE_CLIENT_SECRET.get_or_init(|| {
        std::env::var("GOOGLE_CLIENT_SECRET")
            .unwrap_or_else(|_| env!("GOOGLE_CLIENT_SECRET").to_string())
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct EmailConfig {
    sender_email: String,
    sender_name: String,
    app_password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct EmailRequest {
    to_email: String,
    to_name: String,
    subject: String,
    body: String,
}

#[tauri::command]
fn send_email(config: EmailConfig, request: EmailRequest) -> Result<String, String> {
    // Build the email
    let email = Message::builder()
        .from(
            format!("{} <{}>", config.sender_name, config.sender_email)
                .parse()
                .map_err(|e| format!("Invalid sender address: {}", e))?,
        )
        .to(format!("{} <{}>", request.to_name, request.to_email)
            .parse()
            .map_err(|e| format!("Invalid recipient address: {}", e))?)
        .subject(&request.subject)
        .header(ContentType::TEXT_PLAIN)
        .body(request.body)
        .map_err(|e| format!("Failed to build email: {}", e))?;

    // Create SMTP transport for Gmail
    let creds = Credentials::new(config.sender_email.clone(), config.app_password);

    let mailer = SmtpTransport::relay("smtp.gmail.com")
        .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
        .credentials(creds)
        .build();

    // Send the email
    match mailer.send(&email) {
        Ok(_) => Ok("Email sent successfully!".to_string()),
        Err(e) => Err(format!("Failed to send email: {}", e)),
    }
}

#[tauri::command]
fn test_email_connection(config: EmailConfig) -> Result<String, String> {
    let creds = Credentials::new(config.sender_email.clone(), config.app_password);

    let mailer = SmtpTransport::relay("smtp.gmail.com")
        .map_err(|e| format!("Failed to create SMTP transport: {}", e))?
        .credentials(creds)
        .build();

    match mailer.test_connection() {
        Ok(true) => Ok("Connection successful!".to_string()),
        Ok(false) => Err("Connection test returned false".to_string()),
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

// ============== Google OAuth ==============

/// OAuth result structure
#[derive(Debug, Serialize, Deserialize)]
struct OAuthResult {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: Option<i64>,
    email: Option<String>,
    name: Option<String>,
}

/// Get Google OAuth URL for mobile - uses same loopback redirect as desktop
/// Google allows loopback redirects for native apps
/// login_hint: Optional email to pre-select in Google's account chooser
#[tauri::command]
fn get_google_auth_url_mobile(login_hint: Option<String>) -> String {
    // Add login_hint if provided - this pre-selects the email in Google's account chooser
    let login_hint_param = match &login_hint {
        Some(email) => format!("&login_hint={}", urlencoding::encode(email)),
        None => String::new(),
    };

    // Use loopback redirect - Google allows this for native apps
    // We'll use port 3850 same as desktop
    let redirect_uri = "http://127.0.0.1:3850/oauth/callback";

    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent{}",
        get_client_id(),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(GOOGLE_SCOPES),
        login_hint_param
    )
}

/// Exchange authorization code for tokens on mobile
/// Uses loopback redirect URI
#[tauri::command]
async fn exchange_google_code_mobile(code: String) -> Result<OAuthResult, String> {
    // Use loopback redirect URI for token exchange
    let redirect_uri = "http://127.0.0.1:3850/oauth/callback".to_string();
    exchange_google_code(code, Some(redirect_uri)).await
}

/// Get Google OAuth URL for desktop
#[tauri::command]
fn get_google_auth_url() -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        get_client_id(),
        urlencoding::encode(GOOGLE_REDIRECT_URI),
        urlencoding::encode(GOOGLE_SCOPES)
    )
}

/// Exchange authorization code for tokens
#[tauri::command]
async fn exchange_google_code(code: String, redirect_uri_override: Option<String>) -> Result<OAuthResult, String> {
    // Use override if provided, otherwise use default
    let redirect_uri = redirect_uri_override.as_deref().unwrap_or(GOOGLE_REDIRECT_URI);
    let client_id = get_client_id();
    let client_secret = get_client_secret();

    let client = reqwest::Client::new();
    let token_url = "https://oauth2.googleapis.com/token";

    // Always use client secret with web client ID
    let params: Vec<(&str, &str)> = vec![
        ("code", code.as_str()),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
    ];

    let response = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", error_text));
    }

    let token_data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let access_token = token_data["access_token"].as_str().unwrap_or("").to_string();

    // Get user info
    let (email, name) = match client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(&access_token)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(info) => (
                    info["email"].as_str().map(|s| s.to_string()),
                    info["name"].as_str().map(|s| s.to_string()),
                ),
                Err(_) => (None, None),
            }
        }
        Err(_) => (None, None),
    };

    Ok(OAuthResult {
        access_token,
        refresh_token: token_data["refresh_token"].as_str().map(|s| s.to_string()),
        id_token: token_data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: token_data["expires_in"].as_i64(),
        email,
        name,
    })
}

/// Start OAuth flow for desktop - opens browser and waits for callback
/// login_hint: Optional email to pre-select in Google's account chooser
#[tauri::command]
async fn start_google_oauth(app: tauri::AppHandle, login_hint: Option<String>) -> Result<OAuthResult, String> {
    use std::net::TcpListener;
    use std::io::{Read, Write};
    use tauri_plugin_shell::ShellExt;

    // Always use port 3850 - this must match Google Cloud Console redirect URI
    let port: u16 = 3850;
    let redirect_uri = format!("http://localhost:{}/oauth/callback", port);

    // Try to bind to port 3850, with retries if it's temporarily busy
    let mut listener: Option<TcpListener> = None;
    for attempt in 0..10 {
        match TcpListener::bind(format!("127.0.0.1:{}", port)) {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(_) => {
                if attempt < 9 {
                    // Wait a bit and retry - port might be releasing
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    }

    let listener = listener.ok_or("פורט 3850 תפוס. אנא סגור חלונות דפדפן פתוחים ונסה שוב.")?;

    // Set timeout so we don't wait forever
    listener.set_nonblocking(false).ok();

    // Add login_hint if provided - this pre-selects the email in Google's account chooser
    let login_hint_param = match &login_hint {
        Some(email) => format!("&login_hint={}", urlencoding::encode(email)),
        None => String::new(),
    };

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent{}",
        get_client_id(),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(GOOGLE_SCOPES),
        login_hint_param
    );

    // Open browser with auth URL using tauri shell plugin
    app.shell()
        .open(&auth_url, None)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback - handle the OAuth redirect
    let mut code: Option<String> = None;

    // Accept only a few connections to avoid hanging
    for _ in 0..5 {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // Extract code from query params
                    if let Some(line) = request.lines().next() {
                        if line.starts_with("GET") && line.contains("/oauth/callback") {
                            if let Some(query_start) = line.find('?') {
                                let query_end = line.find(" HTTP").unwrap_or(line.len());
                                let query = &line[query_start + 1..query_end];

                                for param in query.split('&') {
                                    if let Some((key, value)) = param.split_once('=') {
                                        if key == "code" {
                                            code = Some(urlencoding::decode(value)
                                                .unwrap_or_default()
                                                .to_string());
                                            break;
                                        }
                                    }
                                }
                            }

                            // Send response to browser
                            let response_body = if code.is_some() {
                                r#"<!DOCTYPE html>
                                <html dir="rtl">
                                <head><meta charset="UTF-8"><title>התחברות הצליחה</title>
                                <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f2f5;}
                                .box{background:white;padding:40px;border-radius:12px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
                                .icon{font-size:48px;margin-bottom:20px;}</style></head>
                                <body><div class="box"><div class="icon">✅</div><h2>התחברות הצליחה!</h2><p>אפשר לסגור את החלון הזה ולחזור לתוכנה.</p></div></body>
                                </html>"#
                            } else {
                                r#"<!DOCTYPE html>
                                <html dir="rtl">
                                <head><meta charset="UTF-8"><title>שגיאה</title></head>
                                <body><h2>שגיאה בהתחברות</h2><p>נסה שוב.</p></body>
                                </html>"#
                            };

                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                response_body.len(),
                                response_body
                            );

                            let _ = stream.write_all(response.as_bytes());
                            let _ = stream.flush();

                            // Got the callback, stop listening
                            if code.is_some() {
                                break;
                            }
                        } else {
                            // Not the OAuth callback (maybe favicon request), send empty response
                            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
                            let _ = stream.flush();
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }

    // Drop the listener explicitly to release the port
    drop(listener);

    let auth_code = code.ok_or("No authorization code received")?;

    // Exchange code for tokens - pass the actual redirect_uri used
    exchange_google_code(auth_code, Some(redirect_uri)).await
}

/// Refresh access token using refresh token
#[tauri::command]
async fn refresh_google_token(refresh_token: String) -> Result<OAuthResult, String> {
    let client = reqwest::Client::new();
    let client_id = get_client_id();
    let client_secret = get_client_secret();

    let params = [
        ("refresh_token", refresh_token.as_str()),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
    ];

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", error_text));
    }

    let token_data: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    Ok(OAuthResult {
        access_token: token_data["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: Some(refresh_token), // Keep the original refresh token
        id_token: token_data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: token_data["expires_in"].as_i64(),
        email: None,
        name: None,
    })
}

// ============== Printer Functions ==============

/// Printer info structure
#[derive(Debug, Serialize, Deserialize)]
struct PrinterInfo {
    name: String,
    is_default: bool,
}

/// Get list of available printers using PowerShell (Windows only)
#[tauri::command]
fn get_system_printers() -> Result<Vec<PrinterInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object Name, @{Name='IsDefault';Expression={$_.IsDefault}} | ConvertTo-Json -Compress"
            ])
            .output()
            .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("PowerShell error: {}", error));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();

        // Handle single printer (not wrapped in array) vs multiple printers
        if trimmed.starts_with('[') {
            // Multiple printers - already an array
            let printers: Vec<serde_json::Value> = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse printer list: {}", e))?;

            Ok(printers.iter().map(|p| PrinterInfo {
                name: p["Name"].as_str().unwrap_or("").to_string(),
                is_default: p["IsDefault"].as_bool().unwrap_or(false),
            }).collect())
        } else if trimmed.starts_with('{') {
            // Single printer - wrap in result
            let printer: serde_json::Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse printer: {}", e))?;

            Ok(vec![PrinterInfo {
                name: printer["Name"].as_str().unwrap_or("").to_string(),
                is_default: printer["IsDefault"].as_bool().unwrap_or(false),
            }])
        } else {
            // No printers or empty
            Ok(vec![])
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("get_system_printers is only available on Windows".to_string())
    }
}

/// Print a file to a specific printer using PowerShell (Windows only)
#[tauri::command]
fn print_file_to_printer(file_path: String, printer_name: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Use Out-Printer for direct printing
        let ps_script = format!(
            "Get-Content -Path '{}' -Encoding Byte -ReadCount 0 | Out-Printer -Name '{}'",
            file_path.replace("'", "''"),
            printer_name.replace("'", "''")
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output()
            .map_err(|e| format!("Failed to execute print command: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Print error: {}", error));
        }

        Ok("Print job sent successfully".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("print_file_to_printer is only available on Windows".to_string())
    }
}

/// Grant WebView2 camera permissions using WebView2 API
/// This directly grants camera permission
#[tauri::command]
async fn reset_camera_permissions(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_13, ICoreWebView2Profile4,
            COREWEBVIEW2_PERMISSION_KIND_CAMERA,
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        };
        use windows_core::Interface;

        if let Some(main_window) = app.get_webview_window("main") {
            let success = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
            let success_clone = success.clone();

            let result = main_window.with_webview(move |webview| {
                unsafe {
                    let controller = webview.controller();
                    if let Ok(core) = controller.CoreWebView2() {
                        // Cast to ICoreWebView2_13 to get Profile
                        if let Ok(core13) = core.cast::<ICoreWebView2_13>() {
                            if let Ok(profile) = core13.Profile() {
                                // Cast to ICoreWebView2Profile4 to use SetPermissionState
                                if let Ok(profile4) = profile.cast::<ICoreWebView2Profile4>() {
                                    // Grant camera permission for localhost (dev mode)
                                    let origins = [
                                        "http://127.0.0.1:8888",
                                        "http://localhost:8888",
                                        "https://tauri.localhost",
                                        "tauri://localhost",
                                    ];

                                    for origin in origins {
                                        let origin_wide: Vec<u16> = origin.encode_utf16().chain(std::iter::once(0)).collect();
                                        let origin_pcwstr = windows_core::PCWSTR::from_raw(origin_wide.as_ptr());

                                        // Grant camera permission directly
                                        let _ = profile4.SetPermissionState(
                                            COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                                            origin_pcwstr,
                                            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                                            None,
                                        );

                                        // Grant microphone permission
                                        let _ = profile4.SetPermissionState(
                                            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                                            origin_pcwstr,
                                            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                                            None,
                                        );
                                    }
                                    success_clone.store(true, std::sync::atomic::Ordering::SeqCst);
                                }
                            }
                        }
                    }
                }
            });

            if result.is_ok() && success.load(std::sync::atomic::Ordering::SeqCst) {
                return Ok("הרשאות המצלמה אושרו! לחץ שוב על 'אפשר'.".to_string());
            } else if result.is_ok() {
                return Err("לא הצלחתי לאשר הרשאות - ייתכן שגרסת WebView2 לא תומכת".to_string());
            } else {
                return Err(format!("שגיאה: {:?}", result.err()));
            }
        }

        Err("לא נמצא חלון ראשי".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("reset_camera_permissions is only available on Windows".to_string())
    }
}

/// Print a PDF file directly to a specific printer using lpr or PowerShell (Windows only)
/// This function receives the PDF content as base64 and sends it directly to the printer
#[tauri::command]
fn print_pdf_direct(pdf_base64: String, printer_name: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::fs;
        use std::env;
        use base64::{Engine as _, engine::general_purpose::STANDARD};

        // Decode base64 to bytes
        let pdf_bytes = STANDARD.decode(&pdf_base64)
            .map_err(|e| format!("Failed to decode PDF: {}", e))?;

        // Create temp PDF file
        let temp_dir = env::temp_dir();
        let file_name = format!("print_{}.pdf", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis());
        let file_path = temp_dir.join(&file_name);
        let file_path_str = file_path.to_string_lossy().to_string();

        // Write PDF content to temp file
        fs::write(&file_path, &pdf_bytes)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;

        // Use SumatraPDF for truly silent printing
        // If not available, download it automatically to AppData
        let ps_script = format!(
            r#"
$file = '{}'
$printer = '{}'

# Function to find or install SumatraPDF
function Get-SumatraPDF {{
    # Check common locations
    $locations = @(
        "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe",
        "$env:ProgramFiles\SumatraPDF\SumatraPDF.exe",
        "${{env:ProgramFiles(x86)}}\SumatraPDF\SumatraPDF.exe",
        "$env:LOCALAPPDATA\KalGabay\SumatraPDF.exe"
    )

    foreach ($loc in $locations) {{
        if (Test-Path $loc) {{
            return $loc
        }}
    }}

    # Not found - download portable version
    $targetDir = "$env:LOCALAPPDATA\KalGabay"
    $targetPath = "$targetDir\SumatraPDF.exe"

    try {{
        if (-not (Test-Path $targetDir)) {{
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }}

        # Download SumatraPDF portable (64-bit)
        $url = "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.exe"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $targetPath -UseBasicParsing

        if (Test-Path $targetPath) {{
            return $targetPath
        }}
    }} catch {{
        # Download failed
    }}

    return $null
}}

# Get SumatraPDF (install if needed)
$sumatra = Get-SumatraPDF

if ($sumatra) {{
    # SumatraPDF silent print: -print-to "printer" -silent file.pdf
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $sumatra
    $psi.Arguments = "-print-to `"$printer`" -silent `"$file`""
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true
    $psi.UseShellExecute = $false

    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.WaitForExit(30000) # Wait max 30 seconds

    Start-Sleep -Seconds 2
    Remove-Item $file -Force -ErrorAction SilentlyContinue
    exit 0
}}

# Fallback: Use lpr command (built into Windows, silent but may not work with all printers)
try {{
    $lprResult = & lpr -S localhost -P "$printer" "$file" 2>&1
    if ($LASTEXITCODE -eq 0) {{
        Start-Sleep -Seconds 2
        Remove-Item $file -Force -ErrorAction SilentlyContinue
        exit 0
    }}
}} catch {{
    # lpr not available or failed
}}

# Last resort: PrintTo verb (may open window briefly)
$printerBefore = (Get-CimInstance -ClassName Win32_Printer | Where-Object {{$_.Default -eq $true}}).Name
$targetPrinter = Get-CimInstance -ClassName Win32_Printer | Where-Object {{$_.Name -eq $printer}}
if ($targetPrinter) {{
    $targetPrinter | Invoke-CimMethod -MethodName SetDefaultPrinter | Out-Null
}}

try {{
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $file
    $psi.Verb = "PrintTo"
    $psi.Arguments = "`"$printer`""
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Seconds 3
    if (-not $proc.HasExited) {{
        $proc.Kill()
    }}
}} catch {{
    # PrintTo failed, try Print
    Start-Process -FilePath $file -Verb Print -WindowStyle Hidden
    Start-Sleep -Seconds 3
}}

# Restore original default printer
if ($printerBefore) {{
    $originalPrinter = Get-CimInstance -ClassName Win32_Printer | Where-Object {{$_.Name -eq $printerBefore}}
    if ($originalPrinter) {{
        $originalPrinter | Invoke-CimMethod -MethodName SetDefaultPrinter | Out-Null
    }}
}}

Start-Sleep -Seconds 3
Remove-Item $file -Force -ErrorAction SilentlyContinue
"#,
            file_path_str.replace("'", "''"),
            printer_name.replace("'", "''")
        );

        // Run the PowerShell script and wait for it to complete
        let output = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_script])
            .output()
            .map_err(|e| format!("Failed to start print command: {}", e))?;

        if output.status.success() {
            Ok("Print job completed successfully".to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.is_empty() {
                Ok("Print job sent to printer".to_string())
            } else {
                Err(format!("Print error: {}", stderr))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("print_pdf_direct is only available on Windows".to_string())
    }
}

/// Print a PDF file to a specific printer using SumatraPDF or default PDF handler (Windows only)
#[tauri::command]
fn print_pdf_to_printer(file_path: String, _printer_name: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Use Start-Process with -Verb Print for PDF files
        // This will use the default PDF handler
        let ps_script = format!(
            "Start-Process -FilePath '{}' -Verb Print -PassThru | ForEach-Object {{ Start-Sleep -Seconds 2; $_ }} | Stop-Process -Force -ErrorAction SilentlyContinue",
            file_path.replace("'", "''")
        );

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &ps_script])
            .output()
            .map_err(|e| format!("Failed to execute PDF print command: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            // Even if there's an error, the print might have been initiated
            if !error.is_empty() {
                eprintln!("PDF print warning: {}", error);
            }
        }

        Ok("PDF print job initiated".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("print_pdf_to_printer is only available on Windows".to_string())
    }
}

/// Save PDF to Downloads folder and open it (for Android)
#[tauri::command]
async fn save_and_open_pdf(app: tauri::AppHandle, pdf_base64: String, file_name: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    // Decode base64 to bytes
    let pdf_bytes = STANDARD.decode(&pdf_base64)
        .map_err(|e| format!("Failed to decode PDF: {}", e))?;

    #[cfg(target_os = "android")]
    {
        // On Android, save to app's cache directory
        let cache_dir = app.path().app_cache_dir()
            .map_err(|e| format!("Failed to get cache dir: {}", e))?;

        // Create the cache directory if it doesn't exist
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;

        let file_path = cache_dir.join(&file_name);
        let file_path_str = file_path.to_string_lossy().to_string();

        // Write PDF to file
        std::fs::write(&file_path, &pdf_bytes)
            .map_err(|e| format!("Failed to write PDF: {}", e))?;

        // Open with tauri-plugin-opener
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(&file_path_str, None::<&str>)
            .map_err(|e| format!("Failed to open PDF: {}", e))?;

        Ok(file_path_str)
    }

    #[cfg(not(target_os = "android"))]
    {
        // On desktop, save to temp and open
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(&file_name);
        let file_path_str = file_path.to_string_lossy().to_string();

        std::fs::write(&file_path, &pdf_bytes)
            .map_err(|e| format!("Failed to write PDF: {}", e))?;

        // Open with tauri-plugin-opener
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_path(&file_path_str, None::<&str>)
            .map_err(|e| format!("Failed to open PDF: {}", e))?;

        Ok(file_path_str)
    }
}

/// Send email using Gmail API
/// Supports HTML content and proper UTF-8 encoding for Hebrew subjects and names
#[tauri::command]
async fn send_email_gmail(
    access_token: String,
    to_email: String,
    to_name: String,
    subject: String,
    body: String,
    from_email: String,
    from_name: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}};

    // Encode subject in RFC 2047 format for Hebrew/UTF-8 support
    let encoded_subject = format!("=?UTF-8?B?{}?=", STANDARD.encode(subject.as_bytes()));

    // Encode from_name in RFC 2047 format for Hebrew/UTF-8 support
    let encoded_from_name = format!("=?UTF-8?B?{}?=", STANDARD.encode(from_name.as_bytes()));

    // Encode to_name in RFC 2047 format for Hebrew/UTF-8 support
    let encoded_to_name = format!("=?UTF-8?B?{}?=", STANDARD.encode(to_name.as_bytes()));

    // Determine content type based on body content
    let content_type = if body.contains("<html") || body.contains("<div") || body.contains("<p") {
        "text/html; charset=utf-8"
    } else {
        "text/plain; charset=utf-8"
    };

    // Build RFC 2822 email with proper MIME headers
    let email_content = format!(
        "MIME-Version: 1.0\r\n\
         From: {} <{}>\r\n\
         To: {} <{}>\r\n\
         Subject: {}\r\n\
         Content-Type: {}\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n\
         {}",
        encoded_from_name, from_email,
        encoded_to_name, to_email,
        encoded_subject,
        content_type,
        STANDARD.encode(body.as_bytes())
    );

    // Base64url encode the entire message for Gmail API
    let encoded = URL_SAFE_NO_PAD.encode(email_content.as_bytes());

    let client = reqwest::Client::new();

    println!("Sending email via Gmail API to: {}", to_email);

    let response = client
        .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        .bearer_auth(&access_token)
        .json(&serde_json::json!({ "raw": encoded }))
        .send()
        .await
        .map_err(|e| format!("Failed to send email: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("Gmail API error ({}): {}", status, error_text);
        return Err(format!("Gmail API error ({}): {}", status, error_text));
    }

    println!("Email sent successfully to: {}", to_email);
    Ok("Email sent successfully!".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file for OAuth credentials
    let _ = dotenvy::dotenv();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Set up camera permission handler for WebView2 on Windows
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                use webview2_com::PermissionRequestedEventHandler;
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                };

                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.with_webview(|webview| {
                        unsafe {
                            let controller = webview.controller();
                            if let Ok(core) = controller.CoreWebView2() {
                                // Create permission handler that auto-grants camera/mic
                                let handler = PermissionRequestedEventHandler::create(Box::new(
                                    move |_sender, args| {
                                        if let Some(args) = args {
                                            let mut kind = Default::default();
                                            args.PermissionKind(&mut kind)?;
                                            // Auto-grant camera and microphone permissions
                                            if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                                || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                                            {
                                                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                            }
                                        }
                                        Ok(())
                                    },
                                ));

                                let mut token = Default::default();
                                let _ = core.add_PermissionRequested(&handler, &mut token);
                            }
                        }
                    });
                }
            }
            #[cfg(not(target_os = "windows"))]
            let _ = app;
            Ok(())
        });

    #[cfg(not(target_os = "android"))]
    let builder = builder.plugin(tauri_plugin_printer_v2::init());

    // Android print plugin
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_android_print::init());

    builder
        .invoke_handler(tauri::generate_handler![
            send_email,
            test_email_connection,
            get_google_auth_url,
            get_google_auth_url_mobile,
            exchange_google_code,
            exchange_google_code_mobile,
            start_google_oauth,
            refresh_google_token,
            send_email_gmail,
            get_system_printers,
            print_file_to_printer,
            print_pdf_to_printer,
            print_pdf_direct,
            save_and_open_pdf,
            reset_camera_permissions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
