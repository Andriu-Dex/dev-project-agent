param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$releaseSource = (Resolve-Path -LiteralPath $Source).Path
$releaseDestination = [System.IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $releaseDestination) { throw 'Release archive already exists.' }
[System.IO.Compression.ZipFile]::CreateFromDirectory($releaseSource, $releaseDestination, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$releaseArchive = [System.IO.Compression.ZipFile]::OpenRead($releaseDestination)
try {
    $releaseManifestEntry = $releaseArchive.GetEntry('release-manifest.json')
    if ($null -eq $releaseManifestEntry) { throw 'Release manifest missing.' }
    $releaseReader = [System.IO.StreamReader]::new($releaseManifestEntry.Open())
    try { $releaseManifest = $releaseReader.ReadToEnd() | ConvertFrom-Json } finally { $releaseReader.Dispose() }
    foreach ($releaseFile in $releaseManifest.files) {
        $releaseEntry = $releaseArchive.GetEntry($releaseFile.path)
        if ($null -eq $releaseEntry) { throw 'Release entry missing.' }
        $releaseStream = $releaseEntry.Open()
        $releaseHash = [System.Security.Cryptography.SHA256]::Create()
        try { $releaseDigest = ([System.BitConverter]::ToString($releaseHash.ComputeHash($releaseStream))).Replace('-','').ToLowerInvariant() } finally { $releaseStream.Dispose(); $releaseHash.Dispose() }
        if ($releaseDigest -ne $releaseFile.sha256) { throw 'Release entry hash mismatch.' }
    }
} finally { $releaseArchive.Dispose() }
