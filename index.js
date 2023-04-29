const { execSync, spawn } = require('child_process');
const { existsSync } = require('fs');
const { EOL } = require('os');
const path = require('path');

if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
} else if (process.env.INPUT_PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.INPUT_PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

console.log('process.env.GITHUB_WORKSPACE', process.env.GITHUB_WORKSPACE);
const workspace = process.env.GITHUB_WORKSPACE;
const pkg = getPackageJson();

// Run your GitHub Action!
(async () => {
  const event = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {};

  const messages = event.commits.map(
    commit => commit.message + "\n" + commit.body
  );

  const commitMessage = "version bump to";
  const isVersionBump = messages
    .map(message => message.toLowerCase().includes(commitMessage))
    .includes(true);
  if (isVersionBump) {
    exitSuccess("No action necessary!");
    return;
  }

  let version = "";
  if (messages.map(message => message.includes("fix")).includes(true)) {
    version = "patch";
  }
  else if (messages.map(message => message.includes("patch")).includes(true)) {
    version = "patch";
  }
  else if (messages.map(message => message.includes("feature")).includes(true)) {
    version = "minor";
  }
  else if (messages.map(message => message.includes("minor")).includes(true)) {
    version = "minor";
  }
  else if (messages.map(message => message.includes("breaking")).includes(true)) {
    version = "major";
  }
  else if (messages.map(message => message.includes("bump")).includes(true)) {
    version = "major";
  }

  if (version == "") {
    exitSuccess("Bump not requested.");
  }

  try {
    const current = pkg.version.toString();
    // set git user
    console.log(process.env.GITHUB_USER || 'mtgatool-bot');
    console.log(process.env.GITHUB_EMAIL || 'mtgatool@gmail.com');
    await runInWorkspace('git', ['config', 'user.name', `"${process.env.GITHUB_USER || 'mtgatool-bot'}"`])
    await runInWorkspace('git', ['config', 'user.email', `"${process.env.GITHUB_EMAIL || 'mtgatool@gmail.com'}"`])

    const currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(
      process.env.GITHUB_REF
    )[1];
    console.log("currentBranch:", currentBranch);

    if (currentBranch !== "master") {
      exitSuccess("Not in master!");
    }

    // now go to the actual branch to perform the same versioning
    await runInWorkspace("git", ["checkout", currentBranch]);
    await runInWorkspace("npm", [
      "version",
      "--allow-same-version=true",
      "--git-tag-version=false",
      current
    ]);
    console.log("current:", current, "/", "version:", version);

    let newVersion = execSync(`npm version --git-tag-version=false ${version}`)
      .toString()
      .trim();
    newVersion = `${process.env["INPUT_TAG-PREFIX"]}${newVersion}`;
    console.log("new version:", newVersion);

    await runInWorkspace("git", [
      "commit",
      "-a",
      "-m",
      `ci: ${commitMessage} ${newVersion}`
    ]);

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    // console.log(Buffer.from(remoteRepo).toString('base64'))
    await runInWorkspace("git", ["tag", newVersion]);
    await runInWorkspace("git", ["push", remoteRepo, "--follow-tags"]);
    await runInWorkspace("git", ["push", remoteRepo, "--tags"]);
  } catch (e) {
    logError(e);
    exitFailure("Failed to bump version");
  }
  exitSuccess("Version bumped!");
})();

function getPackageJson() {
  const pathToPackage = path.join(workspace, 'package.json');
  if (!existsSync(pathToPackage)) throw new Error("package.json could not be found in your project's root.");
  return require(pathToPackage);
}

function exitSuccess(message) {
  console.info(`✔  success   ${message}`);
  process.exit(0);
}

function exitFailure(message) {
  logError(message);
  process.exit(1);
}

function logError(error) {
  console.error(`✖  fatal     ${error.stack || error}`);
}

function runInWorkspace(command, args) {
  return new Promise((resolve, reject) => {
    console.log('runInWorkspace | command:', command, 'args:', args);
    const child = spawn(command, args, { cwd: workspace });
    let isDone = false;
    const errorMessages = [];
    child.on('error', (error) => {
      if (!isDone) {
        isDone = true;
        reject(error);
      }
    });
    child.stderr.on('data', (chunk) => errorMessages.push(chunk));
    child.on('exit', (code) => {
      if (!isDone) {
        if (code === 0) {
          resolve();
        } else {
          reject(`${errorMessages.join('')}${EOL}${command} exited with code ${code}`);
        }
      }
    });
  });
  //return execa(command, args, { cwd: workspace });
}