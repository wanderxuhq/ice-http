import * as acorn from 'acorn';
import { simple } from 'acorn-walk';

/**
 * Uses Acorn to parse a function's source code string and extract its parameter names.
 * @param {Function} func The function to analyze.
 * @returns {Array<string>} An array of parameter names.
 */
export const getFunctionParams = (func) => {
    if (typeof func !== 'function') {
        throw new Error("Input must be a function.");
    }
    const funcSourceCode = func.toString();
    const codeToParse = `const temp = ${funcSourceCode}`;
    const paramsList = [];
    try {
        const ast = acorn.parse(codeToParse, { ecmaVersion: 2022, sourceType: "script" });
        simple(ast, {
            VariableDeclarator(node) {
                if (node.id.name === 'temp' && node.init) {
                    const funcNode = node.init;
                    if (['FunctionExpression', 'ArrowFunctionExpression'].includes(funcNode.type)) {
                        funcNode.params.forEach(param => {
                            let name;
                            if (param.type === 'RestElement') name = `...${param.argument.name}`;
                            else if (param.type === 'AssignmentPattern') name = param.left.name;
                            else if (param.type === 'Identifier') name = param.name;
                            else if (param.type === 'ObjectPattern' || param.type === 'ArrayPattern') {
                                name = `[${param.type === 'ObjectPattern' ? 'Object' : 'Array'} Destructuring]`;
                            }
                            if (name) paramsList.push(name);
                        });
                    }
                }
            }
        });
    } catch (e) {
        console.error("Acorn parsing error:", e.message);
        return [];
    }
    return paramsList;
};

/**
 * Checks if a source code string is a regex literal.
 * @param {string} sourceString The source string to check.
 * @returns {boolean} True if it's a regex literal.
 */
export const isSourceRegexLiteral = (sourceString) => {
    if (typeof sourceString !== 'string' || sourceString.length === 0) return false;
    try {
        const ast = acorn.parse(sourceString, { ecmaVersion: 2022, sourceType: "script" });
        if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') return false;
        const expression = ast.body[0].expression;
        return expression.type === 'Literal' && Object.prototype.hasOwnProperty.call(expression, 'regex');
    } catch (e) {
        return false;
    }
};

/**
 * Safely converts a '/pattern/flags' string to a RegExp object.
 * @param {string} regexString The regex string to convert.
 * @returns {RegExp | null} The RegExp object or null if invalid.
 */
export const stringToRegExp = (regexString) => {
    if (typeof regexString !== 'string' || regexString.length < 2 || regexString[0] !== '/') return null;
    const lastSlashIndex = regexString.lastIndexOf('/');
    if (lastSlashIndex === 0) return null;
    const pattern = regexString.substring(1, lastSlashIndex);
    const flags = regexString.substring(lastSlashIndex + 1);
    return new RegExp(pattern, flags);
};

/**
 * Checks for potentially dangerous patterns in a regex string to prevent ReDoS.
 * This is a simplified check focusing on nested quantifiers, a common vulnerability.
 * @param {string} pattern The regex pattern string to validate.
 * @returns {boolean} True if the pattern is considered safe, false otherwise.
 */
export const isSafeRegexPattern = (pattern) => {
    // This regex looks for a capturing or non-capturing group `(...)` that contains a quantifier `*` or `+`,
    // and is immediately followed by another quantifier `*` or `+`.
    // This is a strong indicator of a potential "catastrophic backtracking" issue.
    // Example of dangerous patterns it would catch: /(a+)+/, /(a*)*b/, /(.+)*$/
    const dangerousPattern = /\((?!\?)[^)]*[*+]\)[*+]/;

    if (dangerousPattern.test(pattern)) {
        return false; // Found a dangerous pattern
    }

    // The pattern is considered safe from this specific check.
    // More advanced checks could be added here if needed.
    return true;
};