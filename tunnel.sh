#!/usr/bin/env bash
# رابط عام مؤقت للجوال — cloudflared quick tunnel (بلا حساب). يعمل ما دام هذا الجهاز شغّالاً.
# الاستخدام:  ./tunnel.sh   ← يطبع رابط https://….trycloudflare.com
set -e
PORT=${PORT:-5001}
curl -sf "http://localhost:$PORT/api/health" >/dev/null || { echo "شغّل المنصة أولاً: ./start.sh"; exit 1; }
echo "جارٍ فتح النفق إلى localhost:$PORT …"
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate 2>&1 | grep --line-buffered -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 | tee /tmp/mazad-tunnel-url.txt
