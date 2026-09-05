#!/usr/bin/env bash
#
# مزاد+ — تشغيل المشروع كاملاً على جهازك
# Mazad+ — start the whole stack locally (Flask API + Vite frontend).
#
#   ./start.sh          تشغيل عادي
#   ./start.sh --reset  إعادة بناء قاعدة البيانات من الصفر قبل التشغيل
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_PORT=5001
WEB_PORT=5173

green() { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
red() { printf "\033[0;31m%s\033[0m\n" "$1"; }

# --- prerequisites ----------------------------------------------------------
command -v python3 >/dev/null || { red "python3 غير مثبّت"; exit 1; }
command -v npm >/dev/null || { red "Node.js/npm غير مثبّت"; exit 1; }

# --- free the ports ---------------------------------------------------------
for port in "$API_PORT" "$WEB_PORT"; do
  if pids=$(lsof -ti:"$port" 2>/dev/null) && [ -n "$pids" ]; then
    yellow "إيقاف عملية سابقة على المنفذ $port"
    kill -9 $pids 2>/dev/null || true
  fi
done

# --- backend ----------------------------------------------------------------
if [ ! -d "$BACKEND/.venv" ]; then
  yellow "إنشاء البيئة الافتراضية وتثبيت متطلبات الخادم…"
  python3 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"
fi

if [ "${1:-}" = "--reset" ] || [ ! -f "$BACKEND/mazad_plus.db" ]; then
  yellow "بذر قاعدة البيانات…"
  (cd "$BACKEND" && "$BACKEND/.venv/bin/python" seed.py)
fi

# --- frontend ---------------------------------------------------------------
if [ ! -d "$FRONTEND/node_modules" ]; then
  yellow "تثبيت حزم الواجهة (قد يستغرق دقيقة)…"
  (cd "$FRONTEND" && npm install)
fi

# --- run --------------------------------------------------------------------
cleanup() {
  echo
  yellow "إيقاف الخدمات…"
  kill $API_PID $WEB_PID 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$BACKEND" && "$BACKEND/.venv/bin/python" app.py) &
API_PID=$!

(cd "$FRONTEND" && npm run dev) &
WEB_PID=$!

sleep 5
echo
green "════════════════════════════════════════════════════════"
green "  مزاد+ يعمل الآن"
green "════════════════════════════════════════════════════════"
echo "  الواجهة:      http://localhost:$WEB_PORT"
echo "  الواجهة البرمجية: http://localhost:$API_PORT/api/health"
echo
echo "  هويات الدخول التجريبية (محاكاة نفاذ):"
echo "    1023456780  عبدالله الشهري — وكيل بيع"
echo "    1098765432  منى القحطاني — مُقيّم معتمد"
echo "    1055501234  سلطان الدوسري — مشرف الامتثال"
echo
echo "  للإيقاف: Ctrl+C"
green "════════════════════════════════════════════════════════"

wait
