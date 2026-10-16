param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$releaseSource = (Resolve-Path -LiteralPath $Source).Path
$releaseDestination = [System.IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $releaseDestination) { throw 'Release archive already exists.' }
$releaseWriter = [System.IO.Compression.ZipFile]::Open($releaseDestination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($releaseSourceFile in (Get-ChildItem -LiteralPath $releaseSource -File -Recurse -Force)) {
        $releaseRelativePath = $releaseSourceFile.FullName.Substring($releaseSource.Length).TrimStart([char]'\').Replace('\','/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($releaseWriter, $releaseSourceFile.FullName, $releaseRelativePath, [System.IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $releaseWriter.Dispose() }
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
