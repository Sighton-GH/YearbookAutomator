@echo off
setlocal
set "ROOT=%~dp0"

rem Start frontend (use cmd to avoid PowerShell execution policy)
start "YMGA Frontend" /d "%ROOT%web" cmd /k "npm run dev"

rem Start backend (prefer venv Python to avoid missing uvicorn) in this window
if exist "%ROOT%server\.venv\Scripts\python.exe" (
	cd /d "%ROOT%server"
	"%ROOT%server\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
	cd /d "%ROOT%server"
	python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
)

endlocal
@echo off
setlocal
set "ROOT=%~dp0"

rem Start frontend (use cmd to avoid PowerShell execution policy)
start "YMGA Frontend" /d "%ROOT%web" cmd /k "npm run dev"

rem Start backend (prefer venv Python to avoid missing uvicorn) in this window
if exist "%ROOT%server\.venv\Scripts\python.exe" (
	cd /d "%ROOT%server"
	"%ROOT%server\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) else (
	cd /d "%ROOT%server"
	python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
)

endlocal
