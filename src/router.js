import { stringToRegExp, isSourceRegexLiteral, getFunctionParams } from "./utils.js";

const createNode = () => ({
    children: new Map(),
    handler: null,
    mode: 'static',
    regex: null
});

const createRouter = () => {
    const root = createNode();

    const match = (url) => {
        const segments = url.split('/').filter(Boolean);
        let currentNode = root;
        const params = [];
        let matchedPath = [];

        for (const seg of segments) {
            let foundNode = null;
            if (currentNode.children.has(seg)) {
                const potentialNode = currentNode.children.get(seg);
                if (potentialNode.mode === 'static') {
                    foundNode = potentialNode;
                    matchedPath.push(seg);
                }
            }
            if (!foundNode) {
                for (const [key, childNode] of currentNode.children) {
                    if (childNode.mode === 'regex' && seg.match(stringToRegExp(childNode.regex))) {
                        foundNode = childNode;
                        params.push(seg);
                        matchedPath.push(key);
                        break;
                    }
                }
            }
            if (foundNode) {
                currentNode = foundNode;
            } else {
                return null;
            }
        }

        if (currentNode && currentNode.handler) {
            return { handler: currentNode.handler, params, path: `/${matchedPath.join('/')}` };
        }
        return null;
    };

    return { root, match };
};

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        // 1. 监听 'error' 事件，处理连接错误
        req.on('error', (err) => {
            reject(err);
        });

        // 2. 监听 'data' 事件，收集数据块
        req.on('data', (chunk) => {
            chunks.push(chunk);
        });

        // 3. 监听 'end' 事件，表示数据接收完毕
        req.on('end', () => {
            // 将所有 Buffer 块拼接成一个 Buffer
            const rawBodyBuffer = Buffer.concat(chunks);

            // 默认解码为 UTF-8 字符串
            const rawBodyString = rawBodyBuffer.toString('utf8');

            resolve(rawBodyString);
        });
    });
}

// The makeArgs function is now passed to the router, keeping index.js clean.
const makeArgs = (params) => async (req, res, routeParams) => {
    const args = [];
    for (const param of params) {
        if (param === 'req') args.push(req);
        else if (param === 'res') args.push(res);
        else if (param === 'path') args.push(req.url);
        else if (param === 'body') {
            let body = await getRawBody(req);
            const contentType = req.headers['content-type'];
            if (contentType === 'application/json') {
                body = JSON.parse(body);
            }
            args.push(body);
        }
        else if (param === 'slug') {
            const paths = req.url.split('/');
            args.push(paths[paths.length - 1]);
        } else if (param === 'params') args.push(routeParams);
        else args.push(null);
    }
    return args;
};

const loadRoutesFromControllers = (router, controllers) => {
    const loadHandler = (controller, parentPaths, path) => {
        const handleFn = controller[path];
        if (typeof handleFn === 'function') {
            let handler = { fn: handleFn, args: makeArgs(getFunctionParams(handleFn)) };
            let tmpRouter = router.root;
            const fullPathSegments = [...parentPaths, path].filter(Boolean);

            for (const segment of fullPathSegments) {
                let child = tmpRouter.children.get(segment);
                if (!child) {
                    child = createNode();
                    tmpRouter.children.set(segment, child);
                    if (isSourceRegexLiteral(segment)) {
                        child.mode = 'regex';
                        child.regex = segment;
                    }
                }
                tmpRouter = child;
            }
            if (!tmpRouter.mode) tmpRouter.mode = 'static';
            tmpRouter.handler = handler;
            console.log(`Added path /${fullPathSegments.join('/')} [${tmpRouter.mode}]`);
        }
    };

    const loadController = (controller, parentPaths = []) => {
        for (const key in controller) {
            const value = controller[key];
            if (typeof value === 'function') {
                loadHandler(controller, parentPaths, key);
            } else if (typeof value === 'object' && value !== null) {
                loadController(value, [...parentPaths, key]);
            }
        }
    };

    for (const key in controllers) {
        loadController(controllers[key], [key]);
    }
};

export { createRouter, loadRoutesFromControllers };
