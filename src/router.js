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

        req.on('error', (err) => {
            reject(err);
        });

        req.on('data', (chunk) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            const rawBodyBuffer = Buffer.concat(chunks);

            const rawBodyString = rawBodyBuffer.toString('utf8');

            resolve(rawBodyString);
        });
    });
}

const makeArgs = (params) => async (ctx, req, res, routeParams) => {
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
        else if (param === 'ctx') args.push(ctx);
        else if (param === 'handler') args.push(ctx);
        else if (param === 'middleware') args.push(ctx);
        else args.push(null);
    }
    return args;
};

const loadHandlerFn = (handler, handleFn) => {
    const params = getFunctionParams(handleFn);
    const args = makeArgs(params);

    const isMiddleware = params.find(e => e === 'middleware');

    if (isMiddleware) {
        if (!handler.fn) {
            if (!handler.beforeMiddleware) {
                handler.beforeMiddleware = []
            }
            handler.beforeMiddleware.push({ fn: handleFn, args });
        } else {
            if (!handler.afterMiddleware) {
                handler.afterMiddleware = []
            }
            handler.afterMiddleware.push({ fn: handleFn, args });
        }
    } else {
        if (handler.fn) {
            throw new Error('handler.fn already exist');
        }

        handler.fn = handleFn;
        handler.args = args;
    }

    return handler;
}

const loadRoutesFromControllers = (router, controllers) => {
    const loadHandler = (handleFn, parentPaths) => {
        let handler = {};

        const fullPathSegments = parentPaths.filter(Boolean);

        if (Array.isArray(handleFn)) {
            for (const fn of handleFn) {
                loadHandlerFn(handler, fn)
            }
        } else if (typeof handleFn === 'function') {
            loadHandlerFn(handler, handleFn)
        } else if (typeof handleFn === 'object' && handleFn !== null) {
            for (const key in handleFn) {
                loadHandler(handleFn[key], [...parentPaths, key]);
            }
        }

        if (handler.fn) {
            let tmpRouter = router.root;
            for (const segment of fullPathSegments) {
                if (segment !== 'index') {
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
            }
            if (!tmpRouter.mode) tmpRouter.mode = 'static';
            tmpRouter.handler = handler;
            console.log(`Added path /${fullPathSegments.join('/')} [${tmpRouter.mode}]`);
        }
    };

    const loadController = (controller, parentPaths = []) => {
        for (const key in controller) {
            const value = controller[key];
            loadHandler(value, [...parentPaths, key]);
        }
    };

    for (const key in controllers) {
        loadController(controllers[key], [key]);
    }
};

export { createRouter, loadRoutesFromControllers };
