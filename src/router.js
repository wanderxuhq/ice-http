import { stringToRegExp, isSourceRegexLiteral, getFunctionParams } from "./utils.js";

const createNode = () => ({
    children: new Map(),
    handler: null,
    mode: 'none',
    regex: null
});

const rootRouter = createNode();
const createRouter = () => {
    const match = (url) => {
        const segments = url.split('/').filter(Boolean);
        let currentNode = rootRouter;
        const params = [];
        let matchedPath = [];

        for (const seg of segments) {
            let foundNode = null;
            if (currentNode.children.has(seg)) {
                const potentialNode = currentNode.children.get(seg);
                //if (potentialNode.mode === 'static') {
                foundNode = potentialNode;
                matchedPath.push(seg);
                //}
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

    return { match };
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

const makeArgs = (params, components) => (ctx, routeParams, next) => {
    const args = [];
    for (const param of params) {
        if (param === 'next') args.push(
            next
        );
        else if (param === 'req') args.push(ctx.req);
        else if (param === 'res') args.push(ctx.res);
        else if (param === 'path') args.push(ctx.req.url);
        else if (param === 'body') {
            args.push(async () => {
                let body = await getRawBody(ctx.req);
                const contentType = ctx.req.headers['content-type'];
                if (contentType === 'application/json') {
                    body = JSON.parse(body);
                }
                return body;
            });
        }
        else if (param === 'slug') {
            const paths = ctx.req.url.split('/');
            args.push(paths[paths.length - 1]);
        } else if (param === 'params') args.push(routeParams);
        else if (param === 'ctx' || param === 'handler' || param === 'middleware') args.push(ctx);
        else {
            if (components.has(param)) {
                args.push(components.get(param));
            }
            args.push(null);
        }
    }
    return args;
};

const loadHandlerFn = (handleFn, components, middlewares) => {
    let handler = {}
    const params = getFunctionParams(handleFn);
    const args = makeArgs(params, components);

    const isMiddleware = params.find(e => e === 'middleware');
    handler.fn = handleFn;
    handler.args = args;
    handler.middlewares = middlewares;
    handler.isMiddleware = isMiddleware;

    return handler;
}

const loadRoutesFromControllers = (controllers, components) => {
    const loadHandler = (router, handleFn, parentPaths, key, parentMiddlewares) => {
        const fullPathSegments = parentPaths.filter(Boolean);

        if (Array.isArray(handleFn)) {
            let tmpRouter = router;
            if (key !== 'index') {
                let child = createNode();
                if (isSourceRegexLiteral(key)) {
                    child.mode = 'regex';
                    child.regex = key;
                } else {
                    child.mode = 'static';
                }

                tmpRouter = child;
            }
            
            let targetHandler = {};

            let middlewares = parentMiddlewares;
            for (const fn of handleFn) {
                if (typeof fn === 'function') {
                    const handler = loadHandlerFn(fn, components);

                    if (handler.fn) {
                        if (!handler.isMiddleware) {
                            targetHandler.fn = handler.fn;
                            targetHandler.args = handler.args;
                            targetHandler.middlewares = middlewares;
                            tmpRouter.handler = targetHandler
                        } else {
                            middlewares.push(handler);
                        }
                    }
                } else if (typeof fn === 'object' && fn !== null) {
                    for (const innerKey in fn) {
                        let handler = loadHandler(tmpRouter, fn[innerKey], [...parentPaths, key], innerKey, [...middlewares]);
                        tmpRouter.children.set(innerKey, handler);
                    }

                    router.children.set(key, tmpRouter);
                }
            }

            router.children.set(key, tmpRouter);
            console.log(`Added path /${fullPathSegments.join('/')}/${key} [${tmpRouter.mode}]`);

            return tmpRouter;
        } else if (typeof handleFn === 'function') {
            const handler = loadHandlerFn(handleFn, components, parentMiddlewares)

            if (handler.fn) {
                let tmpRouter = router;
                if (key !== 'index') {
                    let child = createNode();
                    if (isSourceRegexLiteral(key)) {
                        child.mode = 'regex';
                        child.regex = key;
                    } else {
                        child.mode = 'static';
                    }

                    tmpRouter = child;
                }
                tmpRouter.handler = handler;
                router.children.set(key, tmpRouter);
                console.log(`Added path /${fullPathSegments.join('/')}/${key} [${tmpRouter.mode}]`);
                return tmpRouter;
            }
        } else if (typeof handleFn === 'object' && handleFn !== null) {
            const targetRouter = createNode();
            for (const key in handleFn) {
                let handler = loadHandler(targetRouter, handleFn[key], parentPaths, key, parentMiddlewares);
                targetRouter.children.set(key, handler);
            }
            router.children.set(key, targetRouter);

            return targetRouter;
        }
    };

    const loadController = (controller, parentPath) => {
        const router = createNode();
        for (const key in controller) {
            const value = controller[key];
            const handler = loadHandler(router, value, [parentPath], key, []);

            router.children.set(parentPath, handler);
        }

        return router;
    };

    for (const key in controllers) {
        const router = loadController(controllers[key], key)
        rootRouter.children.set(key, router);
    }
};

export { createRouter, rootRouter, loadRoutesFromControllers };
