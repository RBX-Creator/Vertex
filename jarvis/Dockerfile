FROM node:22-bookworm-slim

# Chromium für Jarvis' Hände (Browser auf dem Server) + Schriften für saubere Bildschirmfotos
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /jarvis
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY core core
COPY brain-template brain-template
COPY ui ui
COPY server/src server/src
ENV JARVIS_DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "server/src/index.js"]
