export declare type DeferredFunc<T = any> = (...args: unknown[]) => T;

export interface NestedDecoratorParams<T> {
    refProperty: string;
    refEntity: DeferredFunc<T>;
    many: boolean;
}

/**
 * Each operation(read all, write all, readl self, write self has corresponding set of roles)
 */
export interface EntityAuthConfig {
    readAll: string[];
    writeAll: string[];
    writeSelf: string[];
    readSelf: string[];
    userIdField?: string;
}

export function Nested<T>(params: NestedDecoratorParams<T>) {
    return (target: any, propertyKey: string) => {
        if (target._nestedEntities) {
            target._nestedEntities.push({
                type: params.refEntity,
                field: propertyKey,
                idsField: params.refProperty,
                many: params.many
            });
        } else {
            target._nestedEntities = [{
                type: params.refEntity,
                field: propertyKey,
                idsField: params.refProperty,
                many: params.many
            }];
        }
    };
}

export function Filtered() {
    return (target: any, propertyKey: string) => {
        if (target._filteredProperties) {
            target._filteredProperties.push(propertyKey);
        } else {
            target._filteredProperties = [propertyKey];
        }
    };
}

export function Auth(config: EntityAuthConfig) {
    return <T extends new (...args: any[]) => {}>(constructor: T) => {
        return class extends constructor {
            _authConfig = config;
        };
    };
}
