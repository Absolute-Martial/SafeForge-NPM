FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm --prefix third_party/npm-package-tester install --legacy-peer-deps \
  && npm --prefix third_party/npm-package-tester run build \
  && npm --prefix frontend ci \
  && npm --prefix frontend run build \
  && npm --prefix engine ci \
  && npm --prefix engine run build

ENV NODE_ENV=production
ENV SAFEFORGE_NPM_API_HOST=0.0.0.0
ENV SAFEFORGE_NPM_API_PORT=8000
ENV SAFEFORGE_NPM_RUNTIME_ROOT=/runtime

EXPOSE 8000

CMD ["node", "engine/dist/index.js"]
