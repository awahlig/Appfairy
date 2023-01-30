import execa from "execa";
import path from "path";

// Will add given files and will ignore those who aren't exist
export const add = async (files) => {
  const { stdout: root } = await execa("git", ["rev-parse", "--show-toplevel"]);

  files = files.map((file) => path.resolve(".", file));

  let unstaged = await Promise.all([
    execa("git", ["diff", "-z", "--name-only", "--", "."]),
    execa("git", [
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--full-name",
      "--",
      ".",
    ]),
  ]).then((results) => {
    return results.reduce((unstaged, { stdout }) => {
      return unstaged.concat(stdout.split("\0").filter(Boolean));
    }, []);
  });

  unstaged = unstaged.map((file) => path.resolve(root, file));
  files = files.filter((file) => unstaged.includes(file));

  await execa("git", ["add", ...files]);

  return files;
};

// Will commit changes
export const commit = (message, stdio = "inherit") => {
  try {
    return execa("git", ["commit", "-m", message], {
      stdio,
    });
  } catch (e) {
    // Probably no changes were made
  }

  return status(stdio);
};

export const status = (stdio = "inherit") => {
  return execa("git", ["status"], {
    stdio,
  });
};

export default {
  add,
  commit,
  status,
};
