FROM arm64v8/ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    build-essential \
    gpiod \
    libgpiod-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends  nodejs

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

EXPOSE 9092

ENTRYPOINT ["node", "./dist/index"]
