FROM arm64v8/alpine:3

RUN apk add --no-cache \
    # alpine-sdk \
    build-base \
    python3 \
    libgpiod \
    libgpiod-dev \
    openssl \
    nodejs \
    npm \
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

EXPOSE 9092 4334 9229

ENTRYPOINT ["node", "--inspect=0.0.0.0:9229", "./dist/index"]