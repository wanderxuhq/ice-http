import * as acorn from 'acorn';
// 注意：acorn-walk 通常需要使用这种形式导入
import { simple } from 'acorn-walk';

/**
 * 使用 Acorn 解析函数的源代码字符串，提取参数名称列表。
 * @param {Function} func - 要分析的函数对象。
 * @returns {Array<string>} 参数名称的数组。
 */
const getFunctionParams = (func) => {
        // 1. 确保输入是函数
        if (typeof func !== 'function') {
            throw new Error("Input must be a function.");
        }

        // 2. 将函数转换为源代码字符串
        const funcSourceCode = func.toString();

        // 3. 用一个表达式容器包裹，以便 Acorn 容易解析
        // (例如：const temp = function(...) { ... })
        const codeToParse = `const temp = ${funcSourceCode}`;

        const paramsList = [];

        try {
            // 4. 解析源代码字符串为 AST
            const ast = acorn.parse(codeToParse, {
                ecmaVersion: 2022, // 使用最新标准以支持 async/await, 剩余参数等
                sourceType: "script"
            });

            // 5. 遍历 AST，查找我们的目标函数
            simple(ast, {
                // 查找 VariableDeclarator，通常函数定义都在这里
                VariableDeclarator(node) {
                    // 仅处理我们包裹的 'temp' 变量
                    if (node.id.name === 'temp' && node.init) {
                        const funcNode = node.init;

                        // 确保 init 是一个函数节点 (FunctionExpression 或 ArrowFunctionExpression)
                        if (['FunctionExpression', 'ArrowFunctionExpression'].includes(funcNode.type)) {

                            // 6. 遍历函数的 params 数组
                            funcNode.params.forEach(param => {
                                let name;

                                // 处理 RestElement (...roles)
                                if (param.type === 'RestElement') {
                                    name = `...${param.argument.name}`;
                                }
                                // 处理 AssignmentPattern (age = 18)
                                else if (param.type === 'AssignmentPattern') {
                                    // left 属性是 Identifier
                                    name = param.left.name;
                                }
                                // 处理 Identifier (id)
                                else if (param.type === 'Identifier') {
                                    name = param.name;
                                }
                                // 处理 Object/ArrayPattern ({ name, age } 或 [a, b])
                                else if (param.type === 'ObjectPattern' || param.type === 'ArrayPattern') {
                                    // 复杂的解构参数，我们通常返回一个占位符，或进行深度递归解析
                                    name = `[${param.type === 'ObjectPattern' ? 'Object' : 'Array'} Destructuring]`;
                                    // 实际框架中，你需要递归遍历 param.properties 或 param.elements 来获取内部变量名
                                }

                                if (name) {
                                    paramsList.push(name);
                                }
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

// 返回布尔值，表示 params 数组中是否包含指定 param
const hasParam = (params, param) => {
    if (!Array.isArray(params)) return false;
    return params.includes(param);
};

export { getFunctionParams, hasParam };