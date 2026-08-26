$env:PORT = "3001"
$env:HOST = "127.0.0.1"
$env:DATABASE_URL = "postgresql://agentflow:agentflow_dev@localhost:5433/agentflow?schema=public"
$env:JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$env:CREDENTIAL_ENCRYPTION_KEY = "5c37ad2c52418fb8a1736d33dad1fd952dd1d17847ccebeaaca110393bb9736f"
$env:NODE_ENV = "development"
Set-Location "$PSScriptRoot"
npx tsx src/server.ts
