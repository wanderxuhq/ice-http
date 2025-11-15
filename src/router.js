import { stringToRegExp, isSourceRegexLiteral, getFunctionParams } from "./utils/ast.js";
import { getRawBody } from "./utils/request.js";

const createNode = () => ({
    children: new Map(),
    handler: null,
    mode: 'none',
    regex: null
});

const buildRouteTree = (controllers, components) => {
    const rootRouter = createNode();

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

    const createAndConfigureRouteNode = (key) => {
        const node = createNode();
        if (isSourceRegexLiteral(key)) {
            node.mode = 'regex';
            node.regex = key;
        } else {
            node.mode = 'static';
        }
        return node;
    };

    const registerRoute = (router, handleFn, parentPaths, key, parentMiddlewares) => {
        const fullPathSegments = parentPaths.filter(Boolean);

        if (Array.isArray(handleFn)) {
            let tmpRouter = router;
            if (key !== 'index') {
                tmpRouter = createAndConfigureRouteNode(key);
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
                        let handler = registerRoute(tmpRouter, fn[innerKey], [...parentPaths, key], innerKey, [...middlewares]);
                        tmpRouter.children.set(innerKey, handler);
                    }

                    router.children.set(key, tmpRouter);
                }
            }

            router.children.set(key, tmpRouter);
            console.log(`Added path /${fullPathSegments.join('/')}/${key} [${tmpRouter.mode}]`);

            return tmpRouter;
        } else if (typeof handleFn === 'function') {
            const handler = createHandler(handleFn, parentMiddlewares)

            if (handler.fn) {
                let tmpRouter = router;
                if (key !== 'index') {
                    tmpRouter = createAndConfigureRouteNode(key);
                }
                tmpRouter.handler = handler;
                router.children.set(key, tmpRouter);
                console.log(`Added path /${fullPathSegments.join('/')}/${key} [${tmpRouter.mode}]`);
                return tmpRouter;
            }
        } else if (typeof handleFn === 'object' && handleFn !== null) {
            const targetRouter = createNode();
            for (const innerKey in handleFn) {
                let handler = registerRoute(targetRouter, handleFn[innerKey], [...parentPaths, key], innerKey, parentMiddlewares);
                targetRouter.children.set(innerKey, handler);
            }
            router.children.set(key, targetRouter);

            return targetRouter;
        }
    };

    const registerRoutesFromController = (controller, parentPath) => {
        const router = createNode();
        for (const key in controller) {
            const value = controller[key];
            const handler = registerRoute(router, value, [parentPath], key, []);

            router.children.set(parentPath, handler);
        }

        return router;
    };

    for (const key in controllers) {
        const router = registerRoutesFromController(controllers[key], key)
        rootRouter.children.set(key, router);
    }

    return rootRouter;
}

const buildRouter = (controllers, components) => {
    const rootRouter = buildRouteTree(controllers, components);

    const match = (url) => {
        const segments = url.split('/').filter(Boolean);
        let currentNode = rootRouter;
        const params = [];
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
    //Register controller to router


    return { match };
};



export { buildRouter };
