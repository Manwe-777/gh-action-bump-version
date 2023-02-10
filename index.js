const { Toolkit } = require("actions-toolkit");
const { execSync } = require("child_process");

// Change working directory if user defined PACKAGEJSON_DIR
if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`
  process.chdir(process.env.GITHUB_WORKSPACE)
}

// Run your GitHub Action!
Toolkit.run(async tools => {
  const pkg = tools.getPackageJSON();
  const event = tools.context.payload;

  const messages = event.commits.map(
    commit => commit.message + "\n" + commit.body
  );

  const commitMessage = "version bump to";
  const isVersionBump = messages
    .map(message => message.toLowerCase().includes(commitMessage))
    .includes(true);
  if (isVersionBump) {
    tools.exit.success("No action necessary!");
    return;
  }

  let version = "";
  if (messages.map(message => message.includes("fix")).includes(true)) {
    version = "patch";
  }
  if (messages.map(message => message.includes("patch")).includes(true)) {
    version = "patch";
  }
  if (messages.map(message => message.includes("feature")).includes(true)) {
    version = "minor";
  }
  if (messages.map(message => message.includes("minor")).includes(true)) {
    version = "minor";
  }
  if (messages.map(message => message.includes("breaking")).includes(true)) {
    version = "major";
  }

  if (version == "") {
    tools.exit.success("Bump not requested.");
  }
  
  try {
    const current = pkg.version.toString();
    // set git user
    console.log(process.env.GITHUB_USER || 'mtgatool-bot');
    console.log(process.env.GITHUB_EMAIL || 'mtgatool@gmail.com');
    await tools.runInWorkspace('git', ['config', 'user.name', `"${process.env.GITHUB_USER || 'mtgatool-bot'}"`])
    await tools.runInWorkspace('git', ['config', 'user.email', `"${process.env.GITHUB_EMAIL || 'mtgatool@gmail.com'}"`])

    const currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(
      process.env.GITHUB_REF
    )[1];
    console.log("currentBranch:", currentBranch);

    if (currentBranch !== "master") {
      tools.exit.success("Not in master!");
    }

    // now go to the actual branch to perform the same versioning
    await tools.runInWorkspace("git", ["checkout", currentBranch]);
    await tools.runInWorkspace("npm", [
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

    await tools.runInWorkspace("git", [
      "commit",
      "-a",
      "-m",
      `ci: ${commitMessage} ${newVersion}`
    ]);

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    // console.log(Buffer.from(remoteRepo).toString('base64'))
    await tools.runInWorkspace("git", ["tag", newVersion]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--follow-tags"]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--tags"]);
  } catch (e) {
    tools.log.fatal(e);
    tools.exit.failure("Failed to bump version");
  }
  tools.exit.success("Version bumped!");
});
