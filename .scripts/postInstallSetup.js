const os = require('os');
const path = require('path');
const fse = require('fs-extra');
const { Command } = require('commander');

const programArgs = new Command()
    .option('-r, --workspace-folder <workspaceFolder>', 'Workspace folder path')
    .parse(process.argv);
const programOptions = programArgs.opts();

function log(message) {
    // eslint-disable-next-line no-console
    console.log(message);
}

function start() {
    let setupSucceeded = true;

    const rootFolderPath = programOptions.workspaceFolder;

    try {
        if (!rootFolderPath) {
            throw new Error('workspaceFolder parameter is not defined');
        }

        log(`Creating workspace environment: ${path.resolve(rootFolderPath)}`);
        log(`Platform: ${os.type}`);

        const srcFolderPath = path.resolve(rootFolderPath, `setup`, `installAssets`);
        const dstFolderPath = path.resolve(rootFolderPath, `configs`);

        if (!fse.pathExistsSync(dstFolderPath)) {

            // fse.ensureDirSync(dstFolderPath);

            fse.copySync(srcFolderPath, dstFolderPath);
        }

        log(`Setup operation complete`);
    }
    catch (ex) {
        setupSucceeded = false;

        log(`Error: ${ex.message}`);
    }

    if (!setupSucceeded) {
        log(`Setup operation failed, see errors above`);

        process.exit(-1);
    }
}

start();
