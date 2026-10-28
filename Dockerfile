# Pull the maintained Node 24 tag before building; freeze a reviewed digest in CI.
FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/.runtime /app/.revocations && chown node:node /app/.runtime /app/.revocations
USER node
ENV HOST=0.0.0.0 PORT=4173
EXPOSE 4173
VOLUME ["/app/.runtime", "/app/.revocations"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.js"]
