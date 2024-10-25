import fs from "fs";
import path from "path";

export function scanPathForExtensionFiles(
    directory: fs.PathLike,
    extName: string = 'pcss'
): { [key: string]: string } {
    const files = fs.readdirSync(directory, {withFileTypes: true});
    const fileMap: { [key: string]: string } = {};
    for (const file of files) {
        if (typeof directory === "string") {
            const fullPath = path.join(directory, file.name);
            if (file.isDirectory()) {
                const subDirFiles = scanPathForExtensionFiles(fullPath);
                Object.assign(fileMap, subDirFiles);
            } else if (path.extname(file.name) === `.${extName}`) {
                const content = fs.readFileSync(fullPath, 'utf8');
                fileMap[fullPath] = content;
            }
        }
    }
    return fileMap;
}