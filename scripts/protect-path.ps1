param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$protectedItem = Get-Item -LiteralPath (Resolve-Path -LiteralPath $Path).Path
$protectedAcl = $protectedItem.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
$protectedAcl.SetAccessRuleProtection($true, $false)
foreach ($protectedRule in @($protectedAcl.Access)) { [void]$protectedAcl.RemoveAccessRuleSpecific($protectedRule) }
$protectedIdentities = @(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
    [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
)
foreach ($protectedIdentity in $protectedIdentities) {
    if ($protectedItem.PSIsContainer) {
        $protectedRule = [System.Security.AccessControl.FileSystemAccessRule]::new($protectedIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    } else { $protectedRule = [System.Security.AccessControl.FileSystemAccessRule]::new($protectedIdentity, 'FullControl', 'Allow') }
    $protectedAcl.AddAccessRule($protectedRule)
}
$protectedItem.SetAccessControl($protectedAcl)
