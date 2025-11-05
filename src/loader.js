import { readdir, stat } from 'fs/promises'; // 异步文件系统操作
import path from 'path';
// import { createRequire } from 'module'; // 用于在 ES Module 中模拟 require
// const require = createRequire(import.meta.url);
import { pathToFileURL } from 'url'; // <--- 引入 pathToFileURL

export default async function loadModulesAsync(dir) {
    const modules = {};

    try {
        // 1. 异步读取目录内容
        const files = await readdir(dir);

        for (const file of files) {
            const fullPath = path.join(dir, file);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory()) {
                // 递归加载子目录
                Object.assign(modules, await loadModulesAsync(fullPath));
                continue;
            }

            if (file.endsWith('.js')) {
                const moduleName = path.basename(file, '.js');

                // 核心修正：将本地路径转换为 file:// URL
                const moduleURL = pathToFileURL(fullPath).toString();
                
                // 2. 动态加载模块（ES Module 必须使用动态 import()）
                const moduleContent = await import(moduleURL); 
                
                // 如果是 ES Module，导出的内容在 default 属性下
                modules[moduleName] = moduleContent.default || moduleContent;

                console.log(`✅ 已异步加载模块: ${moduleName}`);
            }
        }
    } catch (error) {
        console.error(`异步加载目录失败 ${dir}:`, error.message);
    }

    return modules;
}
