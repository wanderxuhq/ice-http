import stringToRegExp from "./stringToRegExp.js";

const createRouter = () => {
    let obj = {};
    obj.get = (path) => {
        if (obj.children) {
            let child = obj.children?.get(path);

            if (!child) {
                for (const [key, child] of obj.children) {
                    if (child.mode === 'regex') {
                        if (path.match(stringToRegExp(child.regex))) {
                            return child
                        }
                    }
                }
                obj.children
            }

            return child;
        }
    };
    obj.createChild = (path) => {
        if (!obj.children) {
            obj.children = new Map();
        }
        obj.children.set(path, createRouter());
    };

    return obj;
}

export { createRouter };
