import loader from "./src/loader.js";
import { buildRouter } from "./src/router.js";
import { createServer, startServer } from "./src/server.js";
import mime_type from "./src/mime-type.js";
import { requestHeader } from "./src/http-headers.js";

function createResponseProxy(nativeRes) {
    let responseSent = false;
    let responseWrite = false;

    const handler = {
        get(target, prop) {
            if (prop === '__status') {
                return {
                    responseWrite,
                    responseSent
                }
            } else if (prop === 'end') {
                return function (...args) {
                    responseSent = true;
                    return Reflect.apply(target[prop], target, args);
                };
            } else if (prop === 'write') {
                return function (...args) {
                    responseWrite = true;
                    return Reflect.apply(target[prop], target, args);
                }
            }

            const value = target[prop];

            return typeof value === 'function' ? value.bind(target) : value;
        }
    };

    const proxyRes = new Proxy(nativeRes, handler);
    return new Proxy(() => { }, {
        apply: function (target, thisArg, argumentsList) {
            const isStatusCode = typeof argumentsList[0] === 'number' && Number.isInteger(argumentsList[0]);
            if (isStatusCode) {
                proxyRes.statusCode = argumentsList[0];
                proxyRes.end(argumentsList[1]);
            } else {
                proxyRes.end(argumentsList[0]);

                const isStatusCode = typeof argumentsList[1] === 'number' && Number.isInteger(argumentsList[1]);
                if (isStatusCode) {
                    proxyRes.statusCode = argumentsList[1];
                }
            }
        },
        get(target, prop) { return proxyRes[prop]; }
    });
}

/**
 * 判断一个函数是否是异步函数 (async function)。
 * * @param {Function} func - 要检查的函数。
 * @returns {boolean} - 如果是 async function 则返回 true。
 */
function isAsyncFunction(func) {
    // 1. 检查类型是否为 'function'
    if (typeof func !== 'function') {
        return false;
    }

    // 2. 检查其构造器的名称
    // Async functions 实例的构造器是 AsyncFunction
    return func.constructor.name === 'AsyncFunction';
}

const makeNext = (handler, index, ctx, params) => {
    const middleware = handler.middlewares[index];
    if (index < handler.middlewares.length) {
        if (isAsyncFunction(handler.middlewares[index]?.fn)) {
            return async () => await (middleware.fn(... (
                middleware.args(ctx, params, makeNext(handler, index + 1, ctx, params))
            )));
        } else {
            return () => middleware.fn(... (
                middleware.args(ctx, params, makeNext(handler, index + 1, ctx, params))
            ))
        }
    } else {
        if (isAsyncFunction(handler.fn)) {
            return async () => {
                const result = await handler.fn(... (handler.args(ctx, params, null)));
                ctx.result = result;
            }
        } else {
            return () => {
                const result = handler.fn(... (handler.args(ctx, params, null)));
                ctx.result = result;
            }
        }
    }
}

const requestListener = (router) => async (req, res) => {
    const urlPath = req.url || '/';
    const route = router.match(urlPath);

    let ctxMap = new Map();

    const proxyRes = createResponseProxy(res);

    let ctx = {
        map: ctxMap, set: ctxMap.set.bind(ctxMap), get: ctxMap.get.bind(ctxMap),
        nativeReq: req, nativeRes: res,
        req: req,
        res: proxyRes,
    };

    if (route && route.handler) {
        const { handler, params } = route;
        let result;
        if (handler.middlewares) {
            const next = makeNext(handler, 0, ctx, params);
            if (isAsyncFunction(next)) {
                await next();
            } else {
                next();
            }
            result = ctx.result;
        } else {
            const args = await handler.args(ctx, req, proxyRes, params);
            result = await handler.fn(...args);
        }
        
        let responseBody = result;
        if (!proxyRes.__status.responseWrite && !proxyRes.__status.responseSent) {
            proxyRes.setHeader(requestHeader.contentType, mime_type.TEXT_PLAIN + '; charset=utf-8');
        }

        if (isPayload(result)) {
            if (result.contentType === mime_type.APPLICATION_JSON) {
                responseBody = JSON.stringify(result.raw);
                if (!proxyRes.__status.responseWrite && !proxyRes.__status.responseSent) {
                    proxyRes.setHeader(requestHeader.contentType, result.contentType + "; charset=utf-8");
                }
            } else if (result.contentType === mime_type.TEXT_HTML) {
                responseBody = result.raw;
                if (!proxyRes.__status.responseWrite && !proxyRes.__status.responseSent) {
                    proxyRes.setHeader(requestHeader.contentType, result.contentType + "; charset=utf-8");
                }
            }
        } else if (typeof result === 'object') {
            responseBody = JSON.stringify(result);
            if (!proxyRes.__status.responseWrite && !proxyRes.__status.responseSent) {
                proxyRes.setHeader(requestHeader.contentType, mime_type.APPLICATION_JSON + '; charset=utf-8');
            }
        }

        if (!proxyRes.__status.responseWrite && !proxyRes.__status.responseSent) {
            proxyRes.statusCode = 200;
        }
        if (!proxyRes.__status.responseSent) {
            proxyRes.end(String(responseBody));
        }

        if (handler.afterMiddleware) {
            for (const middleware of handler.afterMiddleware) {
                const middlewareResult = await middleware.fn(... (await middleware.args(ctx, req, proxyRes, params)));
                if (middlewareResult === true) {
                    // continue
                } else if (middlewareResult === false) {
                    return;
                } else {
                    if (proxyRes.__status.responseSent) {
                        return;
                    }
                }
            }
        }
    } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not Found');
    }
};

export function Ice(options = {}) {
    const hostname = options.hostname || '127.0.0.1';
    const port = options.port || 3000;
    const components = new Map();

    async function start(controllersPath = './app/controllers') {
        const controllers = await loader(controllersPath);
        const rootRouter = buildRouter(controllers, components)

        const server = createServer(requestListener(rootRouter));
        await startServer(server, port, hostname);
        return server;
    }

    function inject(key, component) {
        components.set(key, component);
    }
    return { start, inject };
}

const PAYLOAD_TAG = Symbol('@@ResponsePayload');
const createPayload = (contentType, raw) => {
    return Object.freeze({
        contentType: contentType,
        raw: raw,
        [PAYLOAD_TAG]: true
    });
};

const isPayload = (obj) => {
    return typeof obj === 'object' && obj !== null && obj[PAYLOAD_TAG] === true;
};

export function html(raw) { return createPayload(mime_type.TEXT_HTML, raw); }
export function json(raw) { return createPayload(mime_type.APPLICATION_JSON, raw); }
