FROM node:22-alpine
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
