FROM --platform=$BUILDPLATFORM node:20-slim as buildStage

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    # libgpiod \
    libgpiod-dev \
    openssl \
    && rm -rf /var/cache/apk/*

ENV WORKINGDIR /app
WORKDIR ${WORKINGDIR}

ADD package.json ${WORKINGDIR}/package.json
ADD eslint.config.mjs ${WORKINGDIR}/eslint.config.mjs
ADD tsconfig.json ${WORKINGDIR}/tsconfig.json
ADD setup ${WORKINGDIR}/setup
ADD .scripts ${WORKINGDIR}/.scripts
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

COPY --from=buildStage /app /app

EXPOSE 9092 4334

ENTRYPOINT ["node", "/app/dist/index"]
