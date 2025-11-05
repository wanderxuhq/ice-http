import * as acorn from 'acorn';

/**
 * 使用 Acorn 判断一个源代码字符串是否是正则表达式字面量 (/.../)。
 * @param {string} sourceString - 待检查的源代码字符串。
 * @returns {boolean} 如果是正则表达式字面量，返回 true。
 */
export default (sourceString) => {
    if (typeof sourceString !== 'string' || sourceString.length === 0) {
        return false;
    }
    
    let ast;
    try {
        // 尝试解析源代码
        ast = acorn.parse(sourceString, {
            ecmaVersion: 2022, 
            sourceType: "script" 
        });
    } catch (e) {
        // 如果解析失败（例如，输入是无效代码或不完整的表达式），则肯定不是。
        return false;
    }

    // AST 根节点是 Program，它的 body 数组通常包含顶层语句。
    const body = ast.body;
    
    // 如果 body 不只包含一个表达式语句，则无法确定它是否只是一个字面量
    if (body.length !== 1) {
        return false;
    }

    const statement = body[0];
    
    // 检查：是否为顶层表达式语句（如 `/abc/g;`）
    if (statement.type !== 'ExpressionStatement') {
        return false;
    }
    
    const expression = statement.expression;

    // 检查：表达式是否为 Literal 类型
    if (expression.type === 'Literal') {
        // 关键判断：Literal 节点是否包含 'regex' 属性
        // 只有正则表达式字面量才有这个属性 (而字符串字面量、数字字面量没有)
        return Object.prototype.hasOwnProperty.call(expression, 'regex');
    }
    
    return false;
}
