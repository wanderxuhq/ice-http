import { readdir } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

async function loader(dir) {
    const controllers = {};
    const files = await readdir(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            controllers[file.name] = await loader(fullPath);
        } else if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.mjs'))) {
            const moduleName = path.basename(file.name, path.extname(file.name));
            const module = await import(pathToFileURL(fullPath));
            controllers[moduleName] = module.default;
        }
    }
    return controllers;
}

export default loader;
