#!/usr/bin/env bash
# =============================================================================
# send-test.sh — Script genérico para testar webhooks do AgentFlow via túnel
# =============================================================================
# Uso:
#   ./send-test.sh [payload-file] [tunnel-url] [org-slug] [webhook-path] [secret]
#
# Exemplo:
#   ./send-test.sh ./payloads/json-exemplo.json https://abc123.ngrok-free.app minha-org stripe meu-segredo-123
#
# Se argumentos não forem passados, usa valores padrão (ajuste no topo do script).
# =============================================================================

set -euo pipefail

# ── Configurações padrão (AJUSTE AQUI ou passe como argumentos) ─────────────
DEFAULT_TUNNEL_URL="https://SEU_TUNEL.ngrok-free.app"
DEFAULT_ORG_SLUG="minha-org"
DEFAULT_WEBHOOK_PATH="stripe"
DEFAULT_SECRET="meu-segredo-super-seguro-123"
DEFAULT_PAYLOAD="./payloads/json-exemplo.json"
# ────────────────────────────────────────────────────────────────────────────

# Parse argumentos
PAYLOAD_FILE="${1:-$DEFAULT_PAYLOAD}"
TUNNEL_URL="${2:-$DEFAULT_TUNNEL_URL}"
ORG_SLUG="${3:-$DEFAULT_ORG_SLUG}"
WEBHOOK_PATH="${4:-$DEFAULT_WEBHOOK_PATH}"
SECRET="${5:-$DEFAULT_SECRET}"

# Validações
if [[ ! -f "$PAYLOAD_FILE" ]]; then
  echo "❌ Payload file não encontrado: $PAYLOAD_FILE"
  echo "   Crie um arquivo em testes-webhooks/payloads/ ou passe o caminho como 1º argumento."
  exit 1
fi

if [[ "$TUNNEL_URL" == "https://SEU_TUNEL.ngrok-free.app" ]]; then
  echo "⚠️  ATENÇÃO: TUNNEL_URL não configurado. Edite o script ou passe como 2º argumento."
  echo "   Ex: ./send-test.sh payloads/json-exemplo.json https://abc123.ngrok-free.app minha-org stripe meu-secret"
  exit 1
fi

# Lê raw body do arquivo (preserva formatação exata para HMAC)
RAW_BODY=$(cat "$PAYLOAD_FILE")

# Detecta Content-Type pelo arquivo/extensão
if [[ "$PAYLOAD_FILE" == *.json ]]; then
  CONTENT_TYPE="application/json"
elif [[ "$PAYLOAD_FILE" == *.txt ]] || [[ "$PAYLOAD_FILE" == *.form ]]; then
  CONTENT_TYPE="application/x-www-form-urlencoded"
else
  CONTENT_TYPE="application/json"
fi

# Gera assinatura HMAC-SHA256 (formato exigido: sha256=<hex>)
# Usa openssl (disponível na maioria dos sistemas) ou node se preferir
if command -v openssl &> /dev/null; then
  SIG_HEX=$(echo -n "$RAW_BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
elif command -v node &> /dev/null; then
  SIG_HEX=$(node -e "
    const crypto = require('crypto');
    const secret = process.argv[1];
    const body = process.argv[2];
    console.log(crypto.createHmac('sha256', secret).update(body).digest('hex'));
  " "$SECRET" "$RAW_BODY")
else
  echo "❌ Nem 'openssl' nem 'node' encontrados para calcular HMAC."
  exit 1
fi

SIGNATURE="sha256=$SIG_HEX"

# Monta URL completa
FULL_URL="${TUNNEL_URL%/}/api/webhooks/trigger/${ORG_SLUG}/${WEBHOOK_PATH}"

# Log informativo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Enviando webhook de teste para AgentFlow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL:      $FULL_URL"
echo "Method:   POST"
echo "Org:      $ORG_SLUG"
echo "Path:     $WEBHOOK_PATH"
echo "Content:  $CONTENT_TYPE"
echo "Payload:  $PAYLOAD_FILE"
echo "Signature: $SIGNATURE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Executa curl com verbose para debug
curl -X POST "$FULL_URL" \
  -H "Content-Type: $CONTENT_TYPE" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$RAW_BODY" \
  -v \
  --max-time 30

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Requisição enviada. Verifique:"
echo "   - Resposta HTTP 202 + executionId"
echo "   - Logs da API (terminal onde roda 'pnpm dev')"
echo "   - Prisma Studio: pnpm db:studio → tabela workflowExecution"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"