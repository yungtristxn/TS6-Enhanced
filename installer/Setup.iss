#ifndef Payload
  #error Payload must point to the validated release directory
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif
[Setup]
AppId={{AB06CE8F-2DB9-4F7A-96C5-A4D5874C3562}
AppName=TS6 Enhanced
AppVersion={#AppVersion}
AppPublisher=TS6 Enhanced contributors
DefaultDirName={localappdata}\TS6-Layout\app
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
OutputBaseFilename=TS6-Enhanced-{#AppVersion}-Setup
UninstallDisplayName=TS6 Enhanced
UninstallDisplayIcon={localappdata}\Programs\TeamSpeak\TeamSpeak.exe
CloseApplications=no
RestartApplications=no
SetupLogging=yes
SetupMutex=TS6CompactLayoutInstaller
AllowCancelDuringInstall=no
UninstallLogging=yes
LicenseFile={#Payload}\LICENSE

[Files]
Source: "{#Payload}\*"; DestDir: "{tmp}\tsix-setup"; Flags: dontcopy recursesubdirs createallsubdirs
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Uninstall TS6 Enhanced"; Filename: "{uninstallexe}"

[Messages]
ConfirmUninstall=Remove TS6 Enhanced and restore the saved appearance settings and original TeamSpeak shortcut?%n%nTeamSpeak will close and reopen. Current calls and streams will end. Your identities, bookmarks, chats and server data will be kept.

[Code]
function RunBootstrap(Root, Arguments: String): Boolean;
var Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + Root + '\scripts\Bootstrap.ps1" ' + Arguments,
    Root, SW_HIDE, ewWaitUntilTerminated, Code);
  Result := Result and (Code = 0);
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := 'Install the layout for your Windows account.' + NewLine + NewLine +
    'Setup prepares any missing runtimes, activates the official theme and adds update/uninstall controls inside TeamSpeak.' + NewLine + NewLine +
    'If TeamSpeak needs to restart, current calls and streams will end. Finish them before clicking Install.' + NewLine + NewLine +
    'Original appearance settings and the Start Menu shortcut are saved for removal. Personal TeamSpeak data is kept.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  ExtractTemporaryFiles('{tmp}\tsix-setup\*');
  if not RunBootstrap(ExpandConstant('{tmp}\tsix-setup'), '-Prepare') then
    Result := 'Setup preflight failed. No theme or shortcut was changed. Details are in %LOCALAPPDATA%\TS6-Layout\setup-logs.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    WizardForm.StatusLabel.Caption := 'Activating the layout in TeamSpeak...';
    if not RunBootstrap(ExpandConstant('{app}'), '-RestartClient') then
      RaiseException('Layout activation did not finish. Recovery files were retained. See %LOCALAPPDATA%\TS6-Layout\setup-logs, then rerun this installer.');
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    if not RunBootstrap(ExpandConstant('{app}'), '-Uninstall') then
      RaiseException('Settings could not be restored. Removal stopped before deleting the installed maintenance tools. See %LOCALAPPDATA%\TS6-Layout\setup-logs.');
  end;
end;
