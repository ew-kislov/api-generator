export interface JwtPayload {
    id: number;
    permissions: string[];
}

export function isValidJwtPayload(jwt: JwtPayload): boolean {
    if (!jwt) {
        return false;
    }
    return !!jwt.id && isArrayOfStrings(jwt.permissions);
}

function isArrayOfStrings(value: any): boolean {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
