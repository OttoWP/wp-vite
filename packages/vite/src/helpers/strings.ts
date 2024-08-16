import pathModule from 'path';

export interface ParsedFilePath {
  path: string;
  outPath: string;
  folders: string[];
  fileName: string;
  ext: string;
}

export const parseFilePath = (index: string, path: string): ParsedFilePath => {
  if (index.indexOf('/') !== -1) {
    index = index.split('/').pop() as string;
  }

  const folders = path.split('/');
  const pathIndex = folders.indexOf(index);

  if (pathIndex !== -1) {
    folders.splice(0, pathIndex + 1);
  }

  const file = folders.pop() as string;
  const fileName = parseFileName(file);
  const ext = parseExt(file);
  const kebabFolders = folders.map(segment => pascalToKebab(segment));
  const outPath = pathModule.join(...kebabFolders);

  return {
    path,
    outPath,
    folders,
    fileName,
    ext,
  };
};

export const parseFileName = (file: string): string => {
  return file.substring(0, file.lastIndexOf('.')) || file;
};

export const parseExt = (file: string): string => {
  return file.split('.').pop() as string;
};

export function camelToKebab(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

export const pascalToKebab = (pascalStr: string): string => {
  if (!pascalStr || typeof pascalStr !== 'string') {
    return pascalStr; // Return the original value if it's not a string
  }

  return pascalStr
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')
      .replace(/--/g, '-');
};
