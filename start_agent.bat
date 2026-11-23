@echo off
title Flow Ledger Direct Print Agent
echo ===================================================
echo Starting Flow Ledger Direct Print Agent for TSC TE244...
echo Port: 3211
echo ===================================================
cd /d "%~dp0"
node printer_agent.cjs
pause
