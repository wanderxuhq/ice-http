import { readdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

async function loader(dir, baseDir = dir) {
    const controllers = {};
    const files = await readdir(dir, { withFileTypes: true });
    const resolvedBaseDir = path.resolve(baseDir);

    for (const file of files) {
        const fullPath = path.resolve(dir, file.name);

        // Prevent path traversal
        if (!fullPath.startsWith(resolvedBaseDir)) {
            console.warn(`Skipping file outside of base directory: ${fullPath}`);
            continue;
        }

        if (file.isDirectory()) {
            controllers[file.name] = await loader(fullPath, baseDir);
        } else if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.mjs'))) {
            const moduleName = path.basename(file.name, path.extname(file.name));
            const module = await import(pathToFileURL(fullPath));
            controllers[moduleName] = module.default;
        }
    }
    return controllers;
}

export default loader;
