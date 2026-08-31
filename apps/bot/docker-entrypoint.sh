#!/usr/bin/env bash
set -e

echo "═══════════════════════════════════════════════════════════════"
echo " Starting AgentFlow Bot 24/7 Runtime Environment"
echo " Display: ${DISPLAY:-:99} | Resolution: ${RESOLUTION:-1920x1080x24}"
echo "═══════════════════════════════════════════════════════════════"

# Remove lingering X11 lock files
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true

# 1. Start Xvfb (Virtual Framebuffer Display)
echo "[1/5] Starting Xvfb on display ${DISPLAY:-:99}..."
Xvfb "${DISPLAY:-:99}" -screen 0 "${RESOLUTION:-1920x1080x24}" -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for X server to be available
for i in {1..30}; do
  if xdpyinfo -display "${DISPLAY:-:99}" >/dev/null 2>&1; then
    echo "  -> Xvfb is ready on ${DISPLAY:-:99}."
    break
  fi
  sleep 0.2
done

# 2. Start Fluxbox Window Manager
echo "[2/5] Starting Fluxbox Window Manager..."
fluxbox -display "${DISPLAY:-:99}" &
FLUXBOX_PID=$!

# 3. Start x11vnc (VNC Server on Display)
echo "[3/5] Starting x11vnc server on port ${VNC_PORT:-5900}..."
x11vnc -display "${DISPLAY:-:99}" \
       -forever \
       -shared \
       -rfbport "${VNC_PORT:-5900}" \
       -nopw \
       -noxdamage \
       -bg \
       -o /tmp/x11vnc.log

# 4. Start Websockify / noVNC Bridge
echo "[4/5] Starting noVNC Websockify bridge on port ${NOVNC_PORT:-6080}..."
if [ -d "/usr/share/novnc" ]; then
  websockify --web=/usr/share/novnc "${NOVNC_PORT:-6080}" "localhost:${VNC_PORT:-5900}" &
elif [ -d "/usr/local/novnc" ]; then
  websockify --web=/usr/local/novnc "${NOVNC_PORT:-6080}" "localhost:${VNC_PORT:-5900}" &
else
  websockify "${NOVNC_PORT:-6080}" "localhost:${VNC_PORT:-5900}" &
fi
WEBSOCKIFY_PID=$!

# Optional: Start SSH Daemon if authorized keys provided or tunnel enabled
if [ "${ENABLE_SSH_DEBUG:-false}" = "true" ]; then
  echo "[DEBUG] Starting SSH Daemon on port 2222..."
  sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config 2>/dev/null || true
  service ssh start || /usr/sbin/sshd -p 2222
fi

# 5. Launch Application
echo "[5/5] Launching AgentFlow Bot Runtime Agent..."
echo "  -> Command: $@"

# Cleanup trap for graceful shutdown
cleanup() {
  echo "Shutting down background services..."
  kill -TERM "$FLUXBOX_PID" 2>/dev/null || true
  kill -TERM "$WEBSOCKIFY_PID" 2>/dev/null || true
  kill -TERM "$XVFB_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# Execute main process
exec "$@"
