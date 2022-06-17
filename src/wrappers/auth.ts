import { Resolver } from "graphql-compose";
import _ from "lodash";
import { EntityAuthConfig } from "..";
import { isValidJwtPayload, JwtPayload } from "../core";

export function wrapCreateAuth(resolver: Resolver, authConfig: EntityAuthConfig) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (!checkIfCanWriteSelf(rp.context.user, authConfig) && !checkIfCanWriteAll(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to create this entity.");
        }

        if (rp.args.records) {
            for (const obj of rp.args.records) {
                obj[authConfig.userIdField!] = rp.context.user.id;
            }

            return await next(rp);
        } else if (rp.args.record) {
            rp.args.record[authConfig.userIdField!] = rp.context.user.id;

            return await next(rp);
        } else {
            throw new Error('Wrong data type.');
        }
    });
}

export function authMutationByIdsEach(resolver: Resolver, authConfig: EntityAuthConfig, findByIds: Resolver) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanWriteAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanWriteSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        const ids = rp.args.records.map((record) => record._id);

        const foundRecords = await findByIds.resolve({ args: { _ids: ids }, projection: { [authConfig.userIdField!]: {} } });

        const authCount = foundRecords.filter((item) => item[authConfig.userIdField!] === rp.context.user.id).length;

        if (authCount !== foundRecords.length) {
            throw new Error("Acces denied.");
        }

        return await next(rp);
    });
}

export function wrapMutationAuth(resolver: Resolver, authConfig: EntityAuthConfig, findById: Resolver) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanWriteAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanWriteSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        const foundData = await findById.resolve({ args: rp.args, projection: { [authConfig.userIdField!]: {} } });

        if (foundData.length !== undefined) {
            let validCount = 0;

            for (const obj of foundData) {
                if (obj[authConfig.userIdField!] === rp.context.user.id) {
                    validCount++;
                }
            }

            if (validCount !== foundData.length) {
                throw new Error("Acces denied.");
            }

            return await next(rp);
        } else {
            if (foundData[authConfig.userIdField!] !== rp.context.user.id) {
                throw new Error("Acces denied.");
            }

            return await next(rp);
        }
    });
}

export function wrapMutationWithFilterAuth(resolver: Resolver, authConfig: EntityAuthConfig, findById: Resolver) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanWriteAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanWriteSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        if (rp.args.filter) {
            rp.args.filter[authConfig.userIdField!] = rp.context.user.id;
        } else {
            rp.args.filter = { [authConfig.userIdField!]: rp.context.user.id };
        }

        return await next(rp);
    });
}

export function authQueryWithFilterResolver(resolver: Resolver, authConfig: EntityAuthConfig) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanReadAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanReadSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        /**
         * Adding filter on user id field
         */
        if (!rp.args.filter) {
            rp.args.filter = {
                [authConfig.userIdField!]: rp.context.user.id
            };
        } else {
            rp.args.filter[authConfig.userIdField!] = rp.context.user.id;
        }

        return await next(rp);
    });
}

export function authQueryByIdsResolver(resolver: Resolver, authConfig: EntityAuthConfig) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanReadAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanReadSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        /**
         * Adding user id field to projection and filter result by it
         */
        const isUserField = !!(rp.projection[authConfig.userIdField!]);

        if (!isUserField) {
            rp.projection[authConfig.userIdField!] = {};
        }

        const result: any[] = await next(rp);
        const authResult: any[] = result.filter((item) => item[authConfig.userIdField!] === rp.context.user.id);

        return authResult;
    });
}

export function authQueryOneResolver(resolver: Resolver, authConfig: EntityAuthConfig) {
    /**
     * If no auth constraint provided then return resolver
     */
    if (!isAuthConfigImpactful(authConfig)) {
        return resolver;
    }

    validateAuthObject(authConfig);

    return resolver.wrapResolve((next) => async (rp) => {
        /**
         * If no token(and hence user id) provided then return resolver result
         */
        if (!isValidJwtPayload(rp.context.user)) {
            throw new Error("Access denied. Valid JWT token required");
        }

        if (checkIfCanReadAll(rp.context.user, authConfig)) {
            return await next(rp);
        }

        if (!checkIfCanReadSelf(rp.context.user, authConfig)) {
            throw new Error("Access denied. You don't have permission to see this entity.");
        }

        /**
         * Adding user id field to projection and filter result by it
         */

        if (!rp.projection[authConfig.userIdField!]) {
            rp.projection[authConfig.userIdField!] = {};
        }

        const result: any[] = await next(rp);

        if (!result) {
            return null;
        }

        return result[authConfig.userIdField!] === rp.context.user.id ? result : null;
    });
}

export function validateAuthObject(authConfig: EntityAuthConfig) {
    // if userIdField is undefined then readSelf and writeSelf should be []

    if (!authConfig.userIdField && (authConfig.readSelf.length !== 0 || authConfig.writeSelf.length !== 0)) {
        throw new Error('Wrong auth config provided for object. Provide userIdField or make readSelf and writeSelf properties empty');
    }
}

function isAuthConfigImpactful(authConfig: EntityAuthConfig | undefined) {
    if (!authConfig) {
        return false;
    }

    return true;
}

function checkIfCanReadAll(jwt: JwtPayload, authConfig: EntityAuthConfig) {
    const rolesIntersection = _.intersection(jwt.permissions, authConfig.readAll);

    return rolesIntersection.length !== 0;
}

function checkIfCanWriteAll(jwt: JwtPayload, authConfig: EntityAuthConfig) {
    const rolesIntersection = _.intersection(jwt.permissions, authConfig.writeAll);

    return rolesIntersection.length !== 0;
}

function checkIfCanReadSelf(jwt: JwtPayload, authConfig: EntityAuthConfig) {
    const rolesIntersection = _.intersection(jwt.permissions, authConfig.readSelf);

    return rolesIntersection.length !== 0;
}

function checkIfCanWriteSelf(jwt: JwtPayload, authConfig: EntityAuthConfig) {
    const rolesIntersection = _.intersection(jwt.permissions, authConfig.writeSelf);

    return rolesIntersection.length !== 0;
}
