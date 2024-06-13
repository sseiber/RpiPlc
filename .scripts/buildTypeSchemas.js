const childProcess = require('child_process');
const os = require('os');

function log(message) {
    // eslint-disable-next-line no-console
    console.log(message);
}

async function start() {
    let buildSucceeded = true;

    try {
        log(`Type builder`);
        log(`Platform: ${os.type()}`);

        const typesTsFile = 'rpiPlcTypes.ts';
        const typeNames = [
            'IObserveRequest',
            'IControlRequest',
            'IRpiPlcResponse',
            'IServiceErrorMessage'
        ];

        for (const typeName of typeNames) {
            log(`Building schema for type: ${typeName}`);

            const buildArgs = [
                '--tsconfig',
                './tsconfig.json',
                '--path',
                `./src/models/${typesTsFile}`,
                '--type',
                `${typeName}`,
                '--out',
                `./src/models/${typeName}Schema.json`
            ];

            childProcess.execFileSync('./node_modules/.bin/ts-json-schema-generator', buildArgs, { stdio: [0, 1, 2] });
        }

        log(`Type builder complete`);
    }
    catch (ex) {
        buildSucceeded = false;

        log(`Error: ${ex.message}`);
    }

    if (!buildSucceeded) {
        log(`Type builder failed, exiting...`);

        process.exit(-1);
    }
}

void (async () => {
    await start();
})().catch();
