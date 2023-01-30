import { readFile, readFileSync } from "fs";
import resolvePath from "resolve";
import anzip from "anzip";

const cache = {};

const requireText = (path, transform = (x) => x) => {
  path = resolvePath.sync(path);

  return (cache[path] =
    cache[path] || transform(readFileSync(path).toString()));
};

requireText.promise = (path) =>
  new Promise((resolve, reject) => {
    resolvePath(path, (err, path) => {
      if (err) {
        return reject(err);
      }

      let content = cache[path];

      if (content) {
        return resolve(content);
      }

      readFile(path, (err, content) => {
        if (err) {
          return reject(err);
        }

        cache[path] = content = content.toString();

        resolve(content);
      });
    });
  });

requireText.fromZip = async (zipFile, path) => {
  path = path.replace(/^\//, "");
  const key = `${zipFile}/${path}`;
  let content = cache[key];
  if (content) return content;

  await anzip(zipFile, {
    outputContent: true,
    entryHandler: async (entry) => {
      if (entry.name === path) {
        content = (await entry.getContent()).toString();
      }
    },
  });

  if (content) {
    cache[key] = content;
  }

  return content;
};

export default requireText;
