#ifndef Payload
  #error Payload must point to the validated release directory
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef AppDisplayVersion
  #define AppDisplayVersion AppVersion
#endif
[Setup]
AppId={{AB06CE8F-2DB9-4F7A-96C5-A4D5874C3562}
AppName=TS6 Enhanced
AppVersion={#AppVersion}
AppVerName=TS6 Enhanced {#AppDisplayVersion}
AppPublisher=TS6 Enhanced contributors
DefaultDirName={localappdata}\TS6-Layout\app
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableFinishedPage=yes
DisableStartupPrompt=yes
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

[Files]
Source: "{#Payload}\*"; DestDir: "{tmp}\tsix-setup"; Flags: dontcopy recursesubdirs createallsubdirs
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Uninstall TS6 Enhanced"; Filename: "{uninstallexe}"

[Messages]
ConfirmUninstall=Remove TS6 Enhanced and restore the saved appearance settings and original TeamSpeak shortcut?%n%nTeamSpeak will close and reopen. Current calls and streams will end. Your identities, bookmarks, chats and server data will be kept.

[Code]
var OperationLease: TFileStream;
    LastSetupError: String;

function AdmissionMutex(Attributes: LongWord; InitialOwner: Boolean; Name: String): THandle;
  external 'CreateMutexW@kernel32.dll stdcall';
function WaitForSingleObject(Handle: THandle; Milliseconds: LongWord): LongWord;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function ReleaseMutex(Handle: THandle): Boolean;
  external 'ReleaseMutex@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';
function SetEnvironmentVariable(Name, Value: String): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';
function GetFileAttributes(Name: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function EnterOperation: Boolean;
var Gate: THandle; WaitResult, Attributes: LongWord;
    Path, Cursor, Parent, Token: String; Bytes: AnsiString; Writer: TFileStream;
begin
  Result := False;
  if OperationLease <> nil then begin Result := True; exit; end;
  Path := ExpandConstant('{localappdata}\TS6-Layout\operation.lock');
  Cursor := Path;
  while Cursor <> '' do begin
    Attributes := GetFileAttributes(Cursor);
    if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then exit;
    Parent := ExtractFileDir(Cursor);
    if Parent = Cursor then break;
    Cursor := Parent;
  end;
  Gate := AdmissionMutex(0, False, 'Local\TS6EnhancedOperationAdmission');
  if Gate = 0 then exit;
  WaitResult := WaitForSingleObject(Gate, 3000);
  try
    if (WaitResult <> 0) and (WaitResult <> $80) then exit;
    if not ForceDirectories(ExtractFileDir(Path)) then exit;
    Writer := nil;
    try
      try
        if FileExists(Path) then Writer := TFileStream.Create(Path, fmOpenReadWrite or fmShareExclusive)
        else Writer := TFileStream.Create(Path, fmCreate);
      except
        { An operation is active. Only its child may join below. }
      end;
      if Writer <> nil then begin
        Token := GetSHA256OfString(ExpandConstant('{tmp}') + GetDateTimeString('yyyymmddhhnnsszzz', '-', '-'));
        Bytes := Token;
        Writer.Size := 0;
        Writer.WriteBuffer(Bytes, Length(Bytes));
        Writer.Free;
        Writer := nil;
      end else Token := GetEnv('TSIX_OPERATION_TOKEN');
      OperationLease := TFileStream.Create(Path, fmOpenRead or fmShareDenyWrite);
      if (OperationLease.Size < 32) or (OperationLease.Size > 64) then RaiseException('Invalid operation receipt');
      SetLength(Bytes, OperationLease.Size);
      OperationLease.ReadBuffer(Bytes, Length(Bytes));
      if (Token = '') or (String(Bytes) <> Token) then RaiseException('Another TS6 Enhanced operation is running');
      if not SetEnvironmentVariable('TSIX_OPERATION_TOKEN', Token) then RaiseException('Cannot pass operation to setup');
      Result := True;
    except
      if Writer <> nil then Writer.Free;
      if OperationLease <> nil then OperationLease.Free;
      OperationLease := nil;
    end;
  finally
    if (WaitResult = 0) or (WaitResult = $80) then ReleaseMutex(Gate);
    CloseHandle(Gate);
  end;
end;

procedure DeinitializeSetup;
begin
  if OperationLease <> nil then OperationLease.Free;
end;

function InitializeUninstall: Boolean;
begin
  Result := EnterOperation;
  if not Result then SuppressibleMsgBox('Another TS6 Enhanced operation is running, or its recovery path is unavailable. Finish it and retry.', mbError, MB_OK, IDOK);
end;

procedure DeinitializeUninstall;
begin
  if OperationLease <> nil then OperationLease.Free;
end;

function RunBootstrap(Root, Arguments: String): Boolean;
var Code, I: Integer;
    ErrorFile: String;
    Lines: TArrayOfString;
begin
  LastSetupError := '';
  ErrorFile := ExpandConstant('{tmp}\tsix-setup-error.txt');
  DeleteFile(ErrorFile);
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + Root + '\scripts\Bootstrap.ps1" ' + Arguments + ' -ErrorFile "' + ErrorFile + '"',
    Root, SW_HIDE, ewWaitUntilTerminated, Code);
  Result := Result and (Code = 0);
  if not Result then begin
    if LoadStringsFromFile(ErrorFile, Lines) then
      for I := 0 to GetArrayLength(Lines) - 1 do
        LastSetupError := LastSetupError + Lines[I] + #13#10;
    LastSetupError := Copy(Trim(LastSetupError), 1, 1500);
  end;
end;

function SetupFailure(Summary: String): String;
begin
  Result := Summary;
  if LastSetupError <> '' then Result := Result + #13#10#13#10 + LastSetupError;
  Result := Result + #13#10#13#10 + 'Details: %LOCALAPPDATA%\TS6-Layout\setup-logs';
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := 'Install TS6 Enhanced for your Windows account.' + NewLine + NewLine +
    'TeamSpeak will restart. Finish any calls or streams before clicking Install.';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not EnterOperation then begin
    Result := 'Another TS6 Enhanced operation is running, or its recovery path is unavailable. Finish it and retry.';
    exit;
  end;
  ExtractTemporaryFiles('{tmp}\tsix-setup\*');
  if not RunBootstrap(ExpandConstant('{tmp}\tsix-setup'), '-Prepare') then
    Result := SetupFailure('Setup could not continue.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    WizardForm.StatusLabel.Caption := 'Activating the layout in TeamSpeak...';
    if not RunBootstrap(ExpandConstant('{app}'), '-RestartClient') then
      RaiseException(SetupFailure('Automatic activation could not finish.'));
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    if not RunBootstrap(ExpandConstant('{app}'), '-Uninstall') then
      RaiseException(SetupFailure('Settings could not be restored. Removal stopped; recovery files were retained.'));
  end;
end;
