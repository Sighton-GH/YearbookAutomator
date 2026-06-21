@echo off
setlocal
set "ROOT=%~dp0"
set "YMGA_LICENSE_ADMIN_USERNAME=sighton_admin"
set "YMGA_LICENSE_ADMIN_PASSWORD=Sighton!2026"

rem Start frontend (use cmd to avoid PowerShell execution policy)
start "YMGA Frontend" /d "%ROOT%tool\web" cmd /k "npm run dev"

rem Start backend (prefer venv Python to avoid missing uvicorn) in this window
if exist "%ROOT%tool\server\.venv\Scripts\python.exe" (
	cd /d "%ROOT%tool\server"
	"%ROOT%tool\server\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
	cd /d "%ROOT%tool\server"
	python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
)

endlocal
