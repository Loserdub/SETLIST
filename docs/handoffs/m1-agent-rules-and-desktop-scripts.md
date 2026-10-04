# m1-agent-rules-and-desktop-scripts Tighten agent rules and setup desktop run scripts
Status: done
Changed:
- AGENTS.md
- README.md
- scripts/rebuild.ps1
- scripts/make-desktop-shortcut.ps1
- scripts/cleanup-setlist.ps1
Added deps: none
Public API:
- PowerShell script: scripts/rebuild.ps1
- PowerShell script: scripts/make-desktop-shortcut.ps1
- PowerShell script: scripts/cleanup-setlist.ps1
Tests: verified scripts/rebuild.ps1 runs release build cleanly; verified target/release/SETLIST.exe size and timestamp; verified scripts/make-desktop-shortcut.ps1 target points to SETLIST.exe; verified desktop is not synced with OneDrive
Known gaps: none
Needs from others: none
