import { stringToRegExp, isSourceRegexLiteral, getFunctionParams, isSafeRegexPattern } from "./utils/ast.js";
import { getRawBody } from "./utils/request.js";

const createNode = (snip) => ({
    children: new Map(),
    handler: null,
    key: snip.key,
    mode: snip.mode,
    regex: snip.pattern
});

const parsePathSnip = (snip) => {
    let key = snip;
    let pattern = null;
    let mode = 'static';
    if (snip.startsWith('[')) {
        const keyStart = snip.indexOf('[') + 1;
        const keyEnd = snip.indexOf(']')
        key = snip.substring(keyStart, keyEnd);
        if (keyEnd < snip.length) {
            const hasPattern = snip[keyEnd + 1] === '(';
            if (hasPattern) {
                const patternStart = keyEnd + 2;
                const patternEnd = snip.lastIndexOf(')');
                if (patternEnd === -1) {
                    throw new Error(`Syntax error for ${snip}`);
                }

                mode = 'regex';
                pattern = snip.substring(patternStart, patternEnd);
            } else {
                mode = 'regex';
                pattern = '/.+/';
            }
        }
    }

    return {
        mode,
        key,
        pattern
    }
}

const buildRouteTree = (controllers, components) => {
    const rootRouter = createNode({
        mode: 'none'
    });

    const makeArgs = (params) => (ctx, routeParams, next) => {
        const args = [];
        for (const param of params) {
            if (param === 'next') args.push(
                next
            );
            else if (param === 'req') args.push(ctx.req);
            else if (param === 'res') args.push(ctx.res);
            else if (param === 'method') args.push(ctx.req.method);
            else if (param === 'path') args.push(ctx.req.url);
            else if (param === 'body') {
                args.push(async () => {
                    let body = await getRawBody(ctx.req);
                    const contentType = ctx.req.headers['content-type'];
                    if (contentType === 'application/json') {
                        try {
                            body = JSON.parse(body);
                        } catch (e) {
                            //TODO body cannot parsed
                        }
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
                if (routeParams.has(param)) {
                    args.push(routeParams.get(param));
                } else if (components.has(param)) {
                    args.push(components.get(param));
                } else {
                    args.push(null);
                }
            }
        }
        return args;
    };

    const createHandler = (handleFn, middlewares) => {
        let handler = {}
        const params = getFunctionParams(handleFn);
        const args = makeArgs(params);

        const isMiddleware = params.find(e => e === 'middleware');
        handler.fn = handleFn;
        handler.args = args;
        handler.middlewares = middlewares;
        handler.isMiddleware = isMiddleware;

        return handler;
    }

    const registerRoute = (router, handleFn, parentPaths, snipObj, parentMiddlewares) => {
        const fullPathSegments = parentPaths.filter(Boolean);

        if (Array.isArray(handleFn)) {
            let tmpRouter = router;
            if (snipObj.key !== 'index') {
                tmpRouter = createNode(snipObj)
            }

            let targetHandler = {};

            let middlewares = parentMiddlewares;
            for (const fn of handleFn) {
                if (typeof fn === 'function') {
                    const handler = createHandler(fn);

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
                        const innerKeySnipObj = parsePathSnip(innerKey);
                        let handler = registerRoute(tmpRouter, fn[innerKey], [...parentPaths, snipObj], innerKeySnipObj, [...middlewares]);
                        tmpRouter.children.set(innerKeySnipObj.key, handler);
                    }

                    router.children.set(snipObj.key, tmpRouter);
                }
            }

            //router.children.set(snipObj.key, tmpRouter);
            console.log(`Added path /${fullPathSegments.map(e => e.key).join('/')}/${snipObj.key} [${tmpRouter.mode}]`);

            return tmpRouter;
        } else if (typeof handleFn === 'function') {
            const handler = createHandler(handleFn, parentMiddlewares)

            if (handler.fn) {
                let tmpRouter = router;
                if (snipObj.key !== 'index') {
                    tmpRouter = createNode(snipObj)
                }
                tmpRouter.handler = handler;
                //router.children.set(snipObj.key, tmpRouter);
                console.log(`Added path /${fullPathSegments.map(e => e.key).join('/')}/${snipObj.key} [${tmpRouter.mode}]`);
                return tmpRouter;
            }
        } else if (typeof handleFn === 'object' && handleFn !== null) {
            const targetRouter = createNode(snipObj);
            for (const innerKey in handleFn) {
                const innerKeySnipObj = parsePathSnip(innerKey);
                let handler = registerRoute(targetRouter, handleFn[innerKey], [...parentPaths, snipObj], innerKeySnipObj, parentMiddlewares);
                targetRouter.children.set(innerKeySnipObj.key, handler);
            }

            return targetRouter;
        }
    };

    const registerRoutesFromController = (controller, parentPath) => {
        const router = createNode({
            mode: 'none'
        });
        for (const snip in controller) {
            const value = controller[snip];
            const snipObj = parsePathSnip(snip);
            const handler = registerRoute(router, value, [parentPath], snipObj, []);

            router.children.set(snipObj.key, handler);
        }

        return router;
    };

    for (const key in controllers) {
        const router = registerRoutesFromController(controllers[key], { key, mode: 'static' })
        rootRouter.children.set(key, router);
    }

    return rootRouter;
}

const buildRouter = (controllers, components) => {
    const rootRouter = buildRouteTree(controllers, components);

    const match = (url) => {
        const segments = url.split('/').filter(Boolean);
        let currentNode = rootRouter;
        const params = new Map();
        let matchedPath = [];

        for (const seg of segments) {
            let foundNode = null;
            if (currentNode.children.has(seg)) {
                const potentialNode = currentNode.children.get(seg);
                foundNode = potentialNode;
                matchedPath.push(seg);
            }
            if (!foundNode) {
                for (const [key, childNode] of currentNode.children) {
                    if (childNode.mode === 'regex' && seg.match(stringToRegExp(childNode.regex))) {
                        foundNode = childNode;
                        //TODO params
                        params.set(childNode.key, seg);
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



export { buildRouter };
