# ══════════════════════════════════════════════════════════════════════════════
# AgentFlow Bot - 24/7 Autonomous Browser Agent with noVNC & Playwright
# ══════════════════════════════════════════════════════════════════════════════
FROM ubuntu:24.04

LABEL maintainer="AgentFlow Core Team <dev@agentflow.io>"
LABEL description="Agentflowbot 24/7 autonomous worker with virtual display, noVNC and Playwright"

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    DISPLAY=:99 \
    RESOLUTION=1920x1080x24 \
    VNC_PORT=5900 \
    NOVNC_PORT=6080 \
    BOT_PORT=8080 \
    NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

# Install OS dependencies, X11/Xvfb, VNC server, Fluxbox, Websockify & noVNC
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    procps \
    net-tools \
    iproute2 \
    xvfb \
    x11vnc \
    fluxbox \
    novnc \
    websockify \
    openssh-server \
    dumb-init \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2t64 \
    libxshmfence1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm@9.15.0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Setup SSH Server for optional remote debugging tunnel
RUN mkdir -p /var/run/sshd /root/.ssh \
    && chmod 700 /root/.ssh

# Setup noVNC web directory symlinks if needed
RUN if [ ! -d /usr/share/novnc ]; then \
      mkdir -p /usr/share/novnc && cp -r /usr/share/novnc/* /usr/share/novnc/ 2>/dev/null || true; \
    fi

WORKDIR /app

# Copy root workspace configurations
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/bot/package.json ./apps/bot/

# Install dependencies
RUN pnpm install --filter @agentflow/bot... --frozen-lockfile || pnpm install --filter @agentflow/bot...

# Install Playwright browser binaries and system deps
RUN npx playwright install chromium --with-deps

# Copy source codes
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY apps/bot ./apps/bot

# Build shared packages and bot
RUN pnpm --filter @agentflow/shared build \
    && pnpm --filter @agentflow/sdk build \
    && pnpm --filter @agentflow/bot build

# Copy Entrypoint Script
COPY apps/bot/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose ports:
# 6080: noVNC WebSocket Web UI
# 5900: Raw RFB VNC
# 8080: Bot Agent API / WebSocket Control
# 2222: SSH Tunnel (optional)
EXPOSE 6080 5900 8080 2222

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/bot/dist/index.js"]
