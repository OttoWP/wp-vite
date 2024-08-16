export const flattenToStringArray = (input: string[] | string[][]): string[] => {
    if (Array.isArray(input[0])) {
        return [];
    }
    return input as string[];
}
