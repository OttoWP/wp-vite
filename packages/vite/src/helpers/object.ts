export const deepMerge = <Target extends Record<string, any>, Source extends Record<string, any>>(target: Target, source: Source): Target & Source => {
    for (const key in source) {
        if (source[key] as Object instanceof Object && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }

    return { ...target, ...source };
};


export const varExport = (obj: any, newLine: boolean = true, indent: string = ''): string => {
    const type = typeof obj;

    if (type === 'string') {
        return `'${obj.replace(/'/g, '\\\'')}'`;
    } else if (type === 'number' || type === 'boolean') {
        return obj.toString();
    } else if (Array.isArray(obj)) {
        return 'array(' + obj.map((item) => varExport(item, newLine, indent + '  ')).join(', ') + ' )';
    } else if (type === 'object' && obj !== null) {
        const entries = Object.entries(obj).map(
            ([key, value]) =>
                indent + (newLine ? '  ' : '') + `'${key.replace(/'/g, '\\\'')}' => ` + varExport(value, newLine, indent + (newLine ? '  ' : '')),
        );
        return 'array('
            + (newLine ? '\n' : '')
            + entries.join(',' + (newLine ? '\n' : ''))
            + (newLine ? '\n' : '')
            + indent + ' )';
    }

    return 'NULL';
};