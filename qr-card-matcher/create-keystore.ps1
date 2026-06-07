$keystorePath = "c:\Users\ayelh\Documents\Projects\Biding-matcher\qr-card-matcher\src-tauri\gen\android\kalgabay-release.keystore"
$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"

if (Test-Path $keystorePath) {
    Write-Host "Keystore already exists at $keystorePath"
} else {
    Write-Host "Creating keystore..."
    & $keytool -genkeypair -v -keystore $keystorePath -alias kalgabay -keyalg RSA -keysize 2048 -validity 10000 -storepass kalgabay123 -keypass kalgabay123 -dname "CN=KalGabay, OU=App, O=KalGabay, L=TelAviv, ST=Israel, C=IL"
    Write-Host "Keystore created successfully!"
}
