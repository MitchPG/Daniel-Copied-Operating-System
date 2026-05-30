# Operator environment

- Operator: Mitch (mitch@petraccagroup.com), Forward Firm.
- Hardware: **Windows** PC (a gaming tower plus a laptop). **No Mac.**
- Tailor all shell, environment-variable, and scheduling guidance to Windows:
  use **Task Scheduler** / `schtasks` (not cron/launchd), `setx` or System
  Properties for env vars (not `~/.zshrc`), and PowerShell (or WSL2 if Linux-like
  tooling is needed). Do not assume macOS.
