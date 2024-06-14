FROM amd64/node:20-slim
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
    rm -f eslint.config.mjs && \
    rm -f tsconfig.json && \
    rm -rf setup \
    rm -rf .scripts \
    rm -rf src

EXPOSE 9092

ENTRYPOINT ["node", "./dist/index"]
