FROM --platform=$BUILDPLATFORM node:22-slim AS buildstage

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    # libgpiod \
    libgpiod-dev \
    openssl \
    && rm -rf /var/cache/apk/*

ENV WORKINGDIR=/app
WORKDIR ${WORKINGDIR}

ADD package.json ${WORKINGDIR}/package.json
ADD eslint.config.mjs ${WORKINGDIR}/eslint.config.mjs
ADD tsconfig.json ${WORKINGDIR}/tsconfig.json
ADD src ${WORKINGDIR}/src

RUN npm install -q && \
    npm run build && \
    npm run eslint && \
    npm prune --production && \
    rm -rf src

# Default is --platform=$TARGETPLATFORM
FROM alpine:3

RUN apk add --no-cache \
    libgpiod \
    nodejs \
    && rm -rf /var/cache/apk/*

COPY --from=buildstage /app /app

EXPOSE 9092 4334

ENTRYPOINT ["node", "/app/dist/index"]
