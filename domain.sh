#!/usr/bin/env bash
# رابط ثابت على نطاقك: https://mazad.quailab.dev عبر Cloudflare Tunnel (مسمّى).
# يتطلب تفويضاً لمرة واحدة:  cloudflared tunnel login   (يفتح رابطاً — اختر quailab.dev)
#   ./domain.sh           إنشاء النفق وسجل DNS (مرة واحدة) ثم التشغيل
#   ./domain.sh install   تثبيته خدمةً تعمل عند الإقلاع (launchd)
set -e
HOST=${HOST:-mazadpluse.quailab.dev}; NAME=${NAME:-mazad-plus}; PORT=${PORT:-5001}
CFD=~/.cloudflared
[ -f "$CFD/cert.pem" ] || { echo "لا يوجد تفويض — شغّل: cloudflared tunnel login"; exit 1; }
ID=$(cloudflared tunnel list -o json 2>/dev/null | python3 -c "import json,sys;print(next((t['id'] for t in json.load(sys.stdin) if t['name']=='$NAME'),''))")
if [ -z "$ID" ]; then cloudflared tunnel create "$NAME" >/dev/null; ID=$(cloudflared tunnel list -o json | python3 -c "import json,sys;print(next(t['id'] for t in json.load(sys.stdin) if t['name']=='$NAME'))"); echo "أُنشئ النفق $ID"; fi
cat > "$CFD/config.yml" <<YML
tunnel: $ID
credentials-file: $CFD/$ID.json
ingress:
  - hostname: $HOST
    service: http://localhost:$PORT
  - service: http_status:404
YML
cloudflared tunnel route dns -f "$NAME" "$HOST" >/dev/null 2>&1 && echo "DNS: $HOST → النفق" || echo "DNS موجود مسبقاً"
if [ "${1:-}" = "install" ]; then sudo cloudflared service install && echo "ثُبّت خدمةً — يعمل عند الإقلاع"; exit 0; fi
echo "يعمل على https://$HOST  (Ctrl+C للإيقاف)"; exec cloudflared tunnel run "$NAME"
