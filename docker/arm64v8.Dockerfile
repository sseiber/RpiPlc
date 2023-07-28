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
ADD .eslintrc.json ${WORKINGDIR}/.eslintrc.json
ADD tsconfig.json ${WORKINGDIR}/tsconfig.json
ADD node-libgpiod.d.ts ${WORKINGDIR}/node-libgpiod.d.ts
ADD setup ${WORKINGDIR}/setup
ADD .scripts ${WORKINGDIR}/.scripts
ADD src ${WORKINGDIR}/src

RUN npm install -q && \
    npm run build && \
    npm run eslint && \
    npm prune --production && \
    rm -rf src

EXPOSE 9092 4334

ENTRYPOINT ["node", "./dist/index"]
