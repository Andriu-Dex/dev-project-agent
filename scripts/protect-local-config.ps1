$ErrorActionPreference = 'Stop'
$credentialPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\.env')).Path
$credentialFile = Get-Item -LiteralPath $credentialPath
$credentialAcl = $credentialFile.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
$credentialAcl.SetAccessRuleProtection($true, $false)
foreach ($credentialRule in @($credentialAcl.Access)) {
    [void]$credentialAcl.RemoveAccessRuleSpecific($credentialRule)
}
$credentialUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$credentialIdentities = @(
    $credentialUser,
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
)
foreach ($credentialIdentity in $credentialIdentities) {
    $credentialRule = [System.Security.AccessControl.FileSystemAccessRule]::new($credentialIdentity, 'FullControl', 'Allow')
    $credentialAcl.AddAccessRule($credentialRule)
}
$credentialFile.SetAccessControl($credentialAcl)
