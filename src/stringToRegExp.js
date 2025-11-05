/**
 * 将 '/pattern/flags' 格式的字符串安全转换为 RegExp 对象。
 * @param {string} regexString - 以斜杠包裹的正则表达式字符串。
 * @returns {RegExp | null} 转换后的 RegExp 对象或 null（如果格式不正确）。
 */
export default (regexString) => {
    if (typeof regexString !== 'string' || regexString.length < 2 || regexString[0] !== '/') {
        // 基本检查：必须是字符串且以斜杠开头
        return null;
    }

    // 1. 查找最后一个斜杠的位置，作为模式和标志的分界线
    // 从第二个字符开始查找，确保不匹配开头的斜杠
    const lastSlashIndex = regexString.lastIndexOf('/');

    // 2. 验证格式：确保最后一个斜杠不是第一个斜杠
    if (lastSlashIndex === 0) {
        // 例如输入是 '/'
        return null;
    }

    // 3. 提取模式 (Pattern)
    // 从索引 1 到最后一个斜杠之前
    const pattern = regexString.substring(1, lastSlashIndex);

    // 4. 提取标志 (Flags)
    // 从最后一个斜杠之后开始
    const flags = regexString.substring(lastSlashIndex + 1);

    // 5. 使用 RegExp 构造函数创建对象
    return new RegExp(pattern, flags);

}