# Run from repo root: powershell -File LBL-Cloud\sync-from-site.ps1
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "."
$site = Split-Path $PSScriptRoot -Parent

$dirs = @(
    "docs",
    "frontend\landing\assets",
    "frontend\app\css",
    "frontend\app\js",
    "frontend\shared\js",
    "backend"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null
}

# docs
Copy-Item (Join-Path $site "docs\*.md") (Join-Path $root "docs\") -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $site "frontend\cloud\CLOUD-APP-TZ.md") (Join-Path $root "docs\") -Force

# landing (without pages subfolder)
Get-ChildItem (Join-Path $site "frontend\cloud") -File | Copy-Item -Destination (Join-Path $root "frontend\landing") -Force
if (Test-Path (Join-Path $site "frontend\cloud\assets")) {
    Copy-Item (Join-Path $site "frontend\cloud\assets\*") (Join-Path $root "frontend\landing\assets") -Recurse -Force
}

Copy-Item (Join-Path $site "frontend\cloud\pages\auth") (Join-Path $root "frontend\auth") -Recurse -Force
Copy-Item (Join-Path $site "frontend\cloud\pages\billing") (Join-Path $root "frontend\billing") -Recurse -Force
Copy-Item (Join-Path $site "frontend\cloud\pages\legal") (Join-Path $root "frontend\legal") -Recurse -Force

Copy-Item (Join-Path $site "frontend\pages\file\app\index.html") (Join-Path $root "frontend\app\") -Force
Copy-Item (Join-Path $site "frontend\pages\file\css\lbl-drive*.css") (Join-Path $root "frontend\app\css\") -Force
Copy-Item (Join-Path $site "frontend\pages\file\js\lbl-drive.js") (Join-Path $root "frontend\app\js\") -Force
Copy-Item (Join-Path $site "frontend\pages\file\js\lbl-drive-upload.js") (Join-Path $root "frontend\app\js\") -Force
Copy-Item (Join-Path $site "frontend\js\core\api.js") (Join-Path $root "frontend\shared\js\") -Force

$backendFiles = @(
    "lbl_drive.py",
    "cloud_billing.py",
    "nginx-lbl3d-cloud.conf",
    "nginx-vendor-static.conf",
    "deploy-cloud-app.sh",
    "verify-cloud-deploy.sh",
    "deploy-cloud-nginx.sh",
    "fix-cloud-vendor.sh",
    "dev-serve-cloud.py",
    "FILE-DRIVE-DEPLOY.md"
)
foreach ($f in $backendFiles) {
    $src = Join-Path $site "backend\$f"
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $root "backend\") -Force
    }
}

$count = (Get-ChildItem $root -Recurse -File).Count
Write-Host "LBL-Cloud: copied $count files."
