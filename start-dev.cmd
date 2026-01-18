@echo off
setlocal
set "ROOT=%~dp0"

rem Start backend (prefer venv Python to avoid missing uvicorn)
if exist "%ROOT%server\.venv\Scripts\python.exe" (
	start "YMGA Backend" /d "%ROOT%server" cmd /k ""%ROOT%server\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) else (
	start "YMGA Backend" /d "%ROOT%server" cmd /k "python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
)

rem Start frontend (use cmd to avoid PowerShell execution policy)
start "YMGA Frontend" /d "%ROOT%web" cmd /k "npm run dev"

endlocal
