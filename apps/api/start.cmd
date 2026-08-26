@echo off
set PORT=3001
set HOST=127.0.0.1
set DATABASE_URL=postgresql://agentflow:agentflow_dev@localhost:5433/agentflow?schema=public
set JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
set CREDENTIAL_ENCRYPTION_KEY=5c37ad2c52418fb8a1736d33dad1fd952dd1d17847ccebeaaca110393bb9736f
set NODE_ENV=development
cd /d "C:\Users\VICTOR\Downloads\Claude Code\AgentFlow\apps\api"
npx tsx src/server.ts
