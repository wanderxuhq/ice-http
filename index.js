import loader from "./src/loader.js";
import http from "http";
import { getFunctionParams, hasParam } from "./src/getFunctionParams.js";
import { createRouter } from "./src/router.js";
import isSourceRegexLiteral from "./src/isSourceRegexLiteral.js";

// 定义服务器监听的端口
const hostname = '127.0.0.1'; // 也可以使用 'localhost'
const port = 3000;

let router = createRouter('');
//let r = createRouter('');
//r.children

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
    // normalize and split path into non-empty segments
    const urlPath = req.url || '/';
    const segments = urlPath.split('/').filter(Boolean);

    console.log(`\n收到请求: ${urlPath}`);
    console.log('路径段:', segments);

    // drill down the router tree by segments
    let tmp = router;
    let handler = null;
    let matchPath = [];
    let params = []

    for (const seg of segments) {
        const child = tmp.get(seg);
        if (!child) {
            console.log(`在路径段 "${seg}" 未找到匹配`);
            tmp = null;
            break;
        }
        matchPath.push(seg);
        console.log(`匹配到路径段: ${seg} [${child.mode || 'unknown'}]`);

        if (child.mode === 'regex') {
            params.push(seg)
        }
        tmp = child;
    }

    if (tmp) {
        if (tmp.handler) {
            handler = tmp.handler;
            console.log(`在路径 /${matchPath.join('/')} 找到处理器`);
        } else {
            console.log(`在路径 /${matchPath.join('/')} 未找到处理器`);
        }
    } else {
        console.log('未找到匹配的路由');
    }

    if (handler) {

        const args = handler.args(req, res, params);
        const result = handler.fn(...args);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.write(result);
        res.end();
    } else {
        res.statusCode = 404;
        res.end();
    }
});

// 工厂：给定参数名列表，返回一个在请求到来时构造实际 args 的函数（支持 req,res,get,post）
const makeArgs = (path, params) => (req, res, routeParams) => {
    const args = [];
    let hasGet = false;
    let hasPost = false;

    for (const param of params) {
        if (param === 'req') {
            args.push(req);
        } else if (param === 'res') {
            args.push(res);
        }else if (param === 'path') {
            args.push(req.url);
        } else if (param === 'slug') {
            const paths = req.url.split('/');
            args.push(paths[paths.length - 1]);
        } else if ('params' === param) {
            args.push(routeParams);
        } else if (param === 'get') {
            args.push(null);
            hasGet = true;
        } else if (param === 'post') {
            args.push(null);
            hasPost = true;
        }
    }
    return args;
};

const loadHandler = (controller, parentPaths, path) => {
    const handleFn = controller[path];

    if (handleFn) {
        let handler = { fn: handleFn };
        const params = getFunctionParams(handleFn);

        // walk/create parent path nodes (filter out empty segments)
        let tmpRouter = router;
        for (const parentPath of parentPaths.filter(Boolean)) {
            let child = tmpRouter.get(parentPath);
            if (!child) {
                tmpRouter.createChild(parentPath);
                child = tmpRouter.get(parentPath);

                if (isSourceRegexLiteral(parentPath)) {
                    child.mode = 'regex';
                    child.regex = parentPath;
                }
            }
            tmpRouter = child;
        }

        // ensure a node exists for the handler's own segment
        if (path) {
            let child = tmpRouter;
            if (!path !== 'index') {
                child = tmpRouter.get(path);
            }
            
            if (!child) {
                tmpRouter.createChild(path);
                child = tmpRouter.get(path);

                if (isSourceRegexLiteral(path)) {
                    child.mode = 'regex';
                    child.regex = path;
                }
            }
            tmpRouter = child;
        }

        // 只有当不是正则模式时才设置为static
        if (!tmpRouter.mode) {
            tmpRouter.mode = 'static';
        }

        handler.args = makeArgs(path, params)

        tmpRouter.handler = handler;
        console.log(`Added path ${[...parentPaths, path].filter(Boolean).join('/')} [${tmpRouter.mode}]`);
    }
}

const loadController = (controller, controllerKey) => {
    for (const key in controller) {
        console.log(`Loading ${key}`);
        if (typeof controller[key] === 'function') {
            loadHandler(controller, controllerKey, key);
        } else if (typeof controller[key] === 'object') {
            loadController(controller[key], [...controllerKey, key]);
        }
    }
}

// 递归打印路由树结构
const printRouter = (node, prefix = '', level = 0) => {
    const indent = '  '.repeat(level);
    console.log(`${indent}${prefix || '/'} [${node.mode || 'unknown'}]${node.handler ? ' (has handler)' : ''}`);
    if (node.children) {
        for (const [path, child] of node.children.entries()) {
            printRouter(child, path, level + 1);
        }
    }
};

export function Ice(options = {}) {
    const hostname = options.hostname || '127.0.0.1';
    const port = options.port || 3000;

    async function start(controllersPath = './app/controllers') {
        const controllers = await loader(controllersPath);
        
        for (const key in controllers) {
            const controller = controllers[key];
            loadController(controller, [key]);
        }

        return new Promise((resolve) => {
            server.listen(port, hostname, () => {
                console.log(`Server running at http://${hostname}:${port}/`);
                resolve(server);
            });
        });
    }

    return { start };
}
