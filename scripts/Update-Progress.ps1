#requires -Version 5.1
# Informational window while TeamSpeak is closed for a TS6 Enhanced update.
# It owns no update state: it closes once the watched worker has finished and
# a TeamSpeak window is back (or shortly after), or when the user closes it.
[CmdletBinding()]
param([Parameter(Mandatory)][int]$WatchProcessId,[string]$ClientPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
try{$watched=Get-Process -Id $WatchProcessId -ErrorAction Stop;$null=$watched.Handle}catch{$watched=$null}
$started=[DateTime]::UtcNow;$finished=$null
$background=[Drawing.Color]::FromArgb(24,33,46);$text=[Drawing.Color]::FromArgb(237,242,247);$muted=[Drawing.Color]::FromArgb(182,197,216)
$form=New-Object Windows.Forms.Form
$form.Text='TS6 Enhanced';$form.FormBorderStyle='FixedSingle';$form.MaximizeBox=$false;$form.MinimizeBox=$false
$form.StartPosition='CenterScreen';$form.TopMost=$true;$form.ShowInTaskbar=$true;$form.BackColor=$background
$form.ClientSize=New-Object Drawing.Size(360,112);$form.Font=New-Object Drawing.Font('Segoe UI',9)
try{if($ClientPath -and (Test-Path -LiteralPath $ClientPath -PathType Leaf)){$form.Icon=[Drawing.Icon]::ExtractAssociatedIcon($ClientPath)}}catch{}
$title=New-Object Windows.Forms.Label
$title.Text='Updating TS6 Enhanced';$title.ForeColor=$text;$title.Font=New-Object Drawing.Font('Segoe UI Semibold',11)
$title.Location=New-Object Drawing.Point(20,16);$title.AutoSize=$true
$detail=New-Object Windows.Forms.Label
$detail.Text='TeamSpeak will reopen in a moment.';$detail.ForeColor=$muted
$detail.Location=New-Object Drawing.Point(20,44);$detail.AutoSize=$true
$bar=New-Object Windows.Forms.ProgressBar
$bar.Style='Marquee';$bar.MarqueeAnimationSpeed=30;$bar.Location=New-Object Drawing.Point(20,76);$bar.Size=New-Object Drawing.Size(320,14)
$form.Controls.AddRange(@($title,$detail,$bar))
$clientWindow={
    if(!$ClientPath){return $false}
    [bool](@(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ClientPath -and [long]$_.MainWindowHandle -ne 0 }).Count)
}
$timer=New-Object Windows.Forms.Timer
$timer.Interval=500
$timer.Add_Tick({
    $now=[DateTime]::UtcNow
    if(!$script:finished -and (!$watched -or $watched.HasExited)){$script:finished=$now}
    # Worker done: close when TeamSpeak is back, or after 20 s without it.
    if($script:finished -and ((& $clientWindow) -or ($now-$script:finished).TotalSeconds -gt 20)){$form.Close()}
    if(($now-$started).TotalMinutes -gt 5){$form.Close()}
})
$form.Add_Shown({$timer.Start()})
$form.Add_FormClosed({$timer.Stop()})
[void]$form.ShowDialog()
