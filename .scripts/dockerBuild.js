const childProcess = require('child_process');
const os = require('os');
const path = require('path');
const fse = require('fs-extra');
const { Command } = require('commander');

const programArgs = new Command()
    .option('-c, --config-file <configFile>', 'Build config file')
    .option('-b, --docker-build', 'Docker build the image')
    .option('-d, --debug', 'Use debug build options')
    .option('-p, --docker-push', 'Docker push the image')
    .option('-r, --workspace-folder <workspaceFolder>', 'Workspace folder path')
    .option('-v, --image-version <version>', 'Docker image version override')
    .parse(process.argv);
const programOptions = programArgs.opts();

function log(message) {
    // eslint-disable-next-line no-console
    console.log(message);
}

async function execDockerBuild(dockerArch, dockerImage) {
    const dockerArgs = [
        'buildx',
        'build',
        '-f',
        `docker/Dockerfile`,
        '--platform',
        dockerArch,
        '--push',
        '-t',
        dockerImage,
        '.'
    ];

    childProcess.execFileSync('docker', dockerArgs, { stdio: [0, 1, 2] });
}

async function execDockerPush(dockerImage) {
    // const dockerArgs = [
    //     'push',
    //     dockerImage
    // ];

    // childProcess.execFileSync('docker', dockerArgs, { stdio: [0, 1, 2] });
    log(`Multi-arch builds are pushed automatically during the build process`);
}

async function start() {
    let buildSucceeded = true;

    try {
        if (!programOptions.workspaceFolder) {
            throw new Error('workspaceFolder parameter is not defined');
        }

        const configFile = programOptions.configFile || `imageConfig.json`;
        const imageConfigFilePath = path.resolve(programOptions.workspaceFolder, `configs`, configFile);
        const imageConfig = fse.readJSONSync(imageConfigFilePath);
        const dockerVersion = imageConfig.versionTag || process.env.npm_package_version || programOptions.imageVersion || 'latest';
        const dockerArch = `${imageConfig.arch}` || 'linux/amd64';
        const dockerImage = `${imageConfig.imageName}:${dockerVersion}`;

        log(`Docker image: ${dockerImage}`);
        log(`Platform: ${os.type()}`);

        if (programOptions.dockerBuild) {
            await execDockerBuild(dockerArch, dockerImage);
        }

        if (programOptions.dockerPush) {
            await execDockerPush(dockerImage);
        }

        log(`Docker operation complete`);
    }
    catch (ex) {
        buildSucceeded = false;

        log(`Error: ${ex.message}`);
    }

    if (!buildSucceeded) {
        log(`Docker operation failed, exiting...`);

        process.exit(-1);
    }
}

void (async () => {
    await start();
})().catch();
