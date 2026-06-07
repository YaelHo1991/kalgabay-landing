Add-Type -AssemblyName System.Drawing

$sourcePath = "c:\Users\ayelh\Documents\Projects\Biding-matcher\qr-card-matcher\icons\apk-icon.png"
$basePath = "c:\Users\ayelh\Documents\Projects\Biding-matcher\qr-card-matcher\src-tauri\gen\android\app\src\main\res"

# Android icon sizes
$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

# Load source image
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
Write-Host "Source image size: $($sourceImage.Width) x $($sourceImage.Height)"

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $destFolder = Join-Path $basePath $folder

    # Create resized image
    $destImage = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($sourceImage, 0, 0, $size, $size)

    # Save as ic_launcher.png
    $destPath = Join-Path $destFolder "ic_launcher.png"
    $destImage.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created: $destPath ($size x $size)"

    # Save as ic_launcher_round.png (same image for now)
    $destPathRound = Join-Path $destFolder "ic_launcher_round.png"
    $destImage.Save($destPathRound, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created: $destPathRound ($size x $size)"

    # Save as ic_launcher_foreground.png
    $destPathFg = Join-Path $destFolder "ic_launcher_foreground.png"
    $destImage.Save($destPathFg, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created: $destPathFg ($size x $size)"

    $graphics.Dispose()
    $destImage.Dispose()
}

$sourceImage.Dispose()
Write-Host "Done!"
