#!/usr/bin/env bash
#
# Desplegar una version nueva de Casa Fe en la VPS (desde el 19/10/2026,
# cuando se cayo el plan gratis de Vercel). Despues de mergear a main:
#
#   ssh root@2.25.185.242 casafe-redeploy
#
# Hace: pull -> npm ci si cambiaron las dependencias -> build -> restart ->
# verificacion. Si el build falla NO reinicia: la version vieja sigue sirviendo.
#
# Las migraciones NO: siguen corriendose a mano en el SQL Editor de Supabase,
# donde sigue la base.
#
# El build carga las variables con systemd (EnvironmentFile), igual que el
# servicio, y no con `source`: EMAIL_FROM lleva espacios y "<>", y bash lo
# leeria distinto. Las NEXT_PUBLIC_* se congelan en el build, asi que tienen
# que ser exactamente las del servicio.
set -Eeuo pipefail

BRANCH="${1:-main}"
APP_DIR=/home/casafe/sistema-pilates
ENV_FILE=/etc/casafe/app.env
NODE_BIN=/opt/node22/bin
PORT=3050

die() { echo "ERROR: $1" >&2; exit 1; }
paso() { echo; echo "→ $1"; }
g() { sudo -u casafe -H git -C "$APP_DIR" "$@"; }
# Prioridad minima: la VPS tiene 1 nucleo compartido con ~18 servicios.
como_casafe() {
  systemd-run --quiet --wait --pipe --uid=casafe --gid=casafe \
    -p Nice=19 -p CPUWeight=20 -p MemoryMax=2G \
    -p EnvironmentFile="$ENV_FILE" -p WorkingDirectory="$APP_DIR" \
    -E HOME=/home/casafe -E PATH="$NODE_BIN:/usr/bin:/bin" -E NEXT_TELEMETRY_DISABLED=1 \
    "$@"
}

[ "$(id -u)" = 0 ] || die "hay que correrlo como root (usa systemctl)"
[ -f "$ENV_FILE" ] || die "falta $ENV_FILE"

paso "actualizando el codigo ($BRANCH)"
# next-env.d.ts y tsconfig.tsbuildinfo los reescribe el build y ensucian el arbol.
g checkout -- next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true
ANTES=$(g rev-parse HEAD)
g fetch -q origin "$BRANCH"
g checkout -q "$BRANCH"
g merge -q --ff-only "origin/$BRANCH"
DESPUES=$(g rev-parse HEAD)
if [ "$ANTES" = "$DESPUES" ]; then
  echo "  ya estaba al dia ($(g log --oneline -1))"
else
  echo "  $(g log --oneline "$ANTES..$DESPUES" | wc -l) commits nuevos -> $(g log --oneline -1)"
fi

paso "dependencias"
if [ ! -d "$APP_DIR/node_modules" ] || ! g diff --quiet "$ANTES" "$DESPUES" -- package-lock.json; then
  echo "  reinstalando"
  como_casafe "$NODE_BIN/npm" ci --no-audit --no-fund 2>&1 | tail -2
else
  echo "  sin cambios, se saltea npm ci"
fi

paso "compilando"
como_casafe "$NODE_BIN/node" node_modules/next/dist/bin/next build > /tmp/casafe-build.log 2>&1 \
  || { tail -30 /tmp/casafe-build.log; die "el build fallo — el servicio NO se reinicio"; }
grep -E "Compiled successfully|✓" /tmp/casafe-build.log | head -2 || true

paso "reiniciando"
systemctl restart casafe

paso "verificando"
code=""
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORT/sistema" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || die "la app no responde (HTTP $code). Ver: journalctl -u casafe -n 50"
echo "  OK: $(g log --oneline -1)"
