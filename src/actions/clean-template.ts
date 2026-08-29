import {
  getResourceStats,
  readDirectory,
  readFile,
  removeFolder,
  writeFile,
} from "../utils.ts";

export default function cleanTemplate(templatePath: string, projectName: string): void {
  const resources = readDirectory(templatePath);
  resources.forEach((resource) => {
    const resourcePath = `${templatePath}/${resource}`;
    const resourceStats = getResourceStats(resourcePath);
    if (resourceStats.isDirectory()) {
      switch (resource) {
        case ".github":
        case ".git":
          removeFolder(resourcePath);
          break;
      }
    } else if (resourceStats.isFile()) {
      switch (resource) {
        case "package.json": {
          const packageJSON: Record<string, unknown> = JSON.parse(readFile(resourcePath));
          packageJSON.name = projectName;
          packageJSON.version = "0.0.0";
          packageJSON.description = "";
          packageJSON.author = "";
          packageJSON.license = "";
          packageJSON.homepage = "";
          packageJSON.repository = {};
          packageJSON.bugs = {};
          writeFile(resourcePath, JSON.stringify(packageJSON, null, 2));
          break;
        }
      }
    }
  });
}
