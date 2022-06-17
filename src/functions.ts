import { getModelForClass } from "@typegoose/typegoose";
import _ from 'lodash';
import { ObjectTypeComposer, Resolver, ResolverDefinition, SchemaComposer } from "graphql-compose";
import mongoose, { Document, Model } from 'mongoose';
import { composeMongoose, ObjectTypeComposerWithMongooseResolvers } from "graphql-compose-mongoose";
import { PubSub } from 'graphql-subscriptions';
import http from 'http';
import { execute, GraphQLSchema, subscribe } from 'graphql';
import { ApolloServer } from 'apollo-server-express';
import express from 'express';
import { SubscriptionServer } from 'subscriptions-transport-ws';

import { updateByIdEach } from './resolvers/updateByIdEach';
import { authMutationByIdsEach, authQueryByIdsResolver, authQueryOneResolver, authQueryWithFilterResolver, wrapCreateAuth, wrapMutationAuth, wrapMutationWithFilterAuth } from "./wrappers";
import { EntityAuthConfig } from ".";

const pubsub = new PubSub();

interface GraphqlAttrs {
    query: object;
    mutation: object;
    subscriptions: object;
}

export interface InterfaceResolvers<T = any> {
    interface: new () => T;
    resolvers: { [key: string]: (type: ObjectTypeComposer, mongooseModel: mongoose.Model<T>) => ResolverDefinition<any, any> };
}

export interface Options<T> {
    app: express.Application;
    mongodbUrl: string;
    interfaces: T[];
    port: number;
    path?: string;
    customInterfaceQueries?: InterfaceResolvers[];
    customInterfaceMutations?: InterfaceResolvers[];
    customMutations?: { [key: string]: ResolverDefinition<any, any> };
    customQueries?: { [key: string]: ResolverDefinition<any, any> };
}

interface SchemaBuildOptions<T> {
    interfaces: T[];
    customInterfaceQueries?: InterfaceResolvers[];
    customInterfaceMutations?: InterfaceResolvers[];
    customMutations?: { [key: string]: ResolverDefinition<any, any> };
    customQueries?: { [key: string]: ResolverDefinition<any, any> };
}

interface GeneratorReturnValue {
    schemaComposer: SchemaComposer<any>;
    schema: GraphQLSchema;
    pubsub: PubSub;
}

export async function runGraphqlFromInterfaces<T>(options: Options<T>): Promise<GeneratorReturnValue> {
    await mongoose.connect(options.mongodbUrl, { autoIndex: true });

    /**
     * Running http(s) server
     */

    const httpServer: http.Server = options.app.listen({ port: options.port }, () => {
        console.log(`Server listening on port ${options.port}`);
    });

    /**
     * auto-generation from interfaces
     */
    const { schemaComposer, schema, pubsub } = buildSchemaFromInterfaces(options);

    const subscriptionServer = SubscriptionServer.create({
        schema,
        execute,
        subscribe,
    }, {
        server: httpServer,
        path: options.path,
    });

    const apolloServer = new ApolloServer({
        schema,
        introspection: true,
        plugins: [{
            async serverWillStart() {
                return {
                    async drainServer() {
                        subscriptionServer.close();
                    }
                };
            }
        }],
        context: ({ req }) => {
            const user = (req as any).user || null;
            return { user };
        }
    });

    await apolloServer.start();

    options.app.use(apolloServer.getMiddleware({ path: '/' }));

    apolloServer.applyMiddleware({
        app: options.app,
        path: options.path,
        cors: true
    });

    return { schemaComposer, schema, pubsub };
}

function buildSchemaFromInterfaces<T>(options: SchemaBuildOptions<T>) {
    /**
     * Initializing models and type composers
     */

    const modelsMapping: any = {};

    options.interfaces.forEach((interfaceItem: any) => {
        const model = getModelForClass(interfaceItem);
        model.createIndexes();

        const typeComposer = composeMongoose(model);

        const enitityName = interfaceItem.name;

        if (modelsMapping[enitityName]) {
            throw new Error(`Entity with name ${enitityName} already exists`);
        }

        modelsMapping[enitityName] = {
            interfaceItem,
            model,
            typeComposer
        };
    });

    console.log(`Building schema for models: ${Object.keys(modelsMapping).join(', ')}`);

    const schemaComposer = new SchemaComposer();

    /**
     * Processing interface custom resolvers
     */

    console.log('Adding custom resolvers for interfaces');

    if (options.customInterfaceQueries) {
        options.customInterfaceQueries.forEach((interfaceResolvers) => {
            const name = interfaceResolvers.interface.name;
            const model = modelsMapping[name].model;
            const type = modelsMapping[name].typeComposer;

            console.log(`Processing interface ${name}:`);

            modelsMapping[name].queries = {};
            for (const resolverFunc in interfaceResolvers.resolvers) {
                console.log(`Query ${resolverFunc}`);
                modelsMapping[name].queries[resolverFunc] = schemaComposer.createResolver(interfaceResolvers.resolvers[resolverFunc](type, model));
            }
        });
    }

    if (options.customInterfaceMutations) {
        options.customInterfaceMutations.forEach((interfaceResolvers) => {
            const name = interfaceResolvers.interface.name;
            const model = modelsMapping[name].model;
            const type = modelsMapping[name].typeComposer;

            console.log(`Processing interface ${name}:`);

            modelsMapping[name].mutations = {};
            for (const resolverFunc in interfaceResolvers.resolvers) {
                console.log(`Mutation ${resolverFunc}`);
                modelsMapping[name].mutations[resolverFunc] = schemaComposer.createResolver(interfaceResolvers.resolvers[resolverFunc](type, model));
            }
        });
    }

    /**
     * Nested objects
     */

    console.log('Adding nested types for interfaces');

    Object.values(modelsMapping).forEach((item: any) => {
        if (!new item.interfaceItem()._nestedEntities) {
            return;
        }

        console.log(`Processing interface ${item.interfaceItem.name}`);

        new item.interfaceItem()._nestedEntities.forEach((nestedInfo: any) => {
            item.typeComposer.addFields(
                {
                    [nestedInfo.field]: {
                        type: nestedInfo.many ?
                            modelsMapping[nestedInfo.type().name].typeComposer.List :
                            modelsMapping[nestedInfo.type().name].typeComposer,
                        resolve: (source, args, context, info) => {
                            // console.log(info);
                            return nestedInfo.many ?
                                modelsMapping[nestedInfo.type().name].typeComposer
                                    .mongooseResolvers.findByIds().resolve({ args: { _ids: source[nestedInfo.idsField] } }) :
                                modelsMapping[nestedInfo.type().name].typeComposer
                                    .mongooseResolvers.findById().resolve({ args: { _id: source[nestedInfo.idsField] } });
                        }
                    }
                }
            );

            // with this operation fields are empty
            // item.typeComposer.getInputTypeComposer().addFields({
            //     [nestedInfo.field]: {
            //         type: nestedInfo.many ?
            //             modelsMapping[new (nestedInfo.type())()._entityName].typeComposer.getInputTypeComposer().List :
            //             modelsMapping[new (nestedInfo.type())()._entityName].typeComposer.getInputTypeComposer()
            //     }
            // });

        });
    });

    /**
     * Adding resolvers for each interface
     */

    Object.keys(modelsMapping).forEach(async (key: any) => {
        const item = modelsMapping[key];

        const filteredProperties = new item.interfaceItem()._filteredProperties;
        const authConfig = new item.interfaceItem()._authConfig;

        const { query, mutation, subscriptions } = getGraphqlAttrs(item.model, item.typeComposer, key, filteredProperties, authConfig);

        schemaComposer.Query.addFields({
            ...query,
            ...(item.queries ?? {})
        });

        // [...(Object.values(query)), ...(Object.values((item.queries ?? {})))].forEach((resolver) => {
        //     schemaComposer.Query.addResolver(resolver);
        // });

        schemaComposer.Mutation.addFields({
            ...mutation,
            ...(item.mutations ?? {})
        });

        // [...(Object.values(mutation)), ...(Object.values((item.mutations ?? {})))].forEach((resolver) => {
        //     schemaComposer.Query.addResolver(resolver);
        // });

        schemaComposer.Subscription.addFields({
            ...subscriptions
        });
    });

    /**
     * Adding customer resolvers
     */

    if (options.customMutations || options.customQueries) {
        console.log('Adding custom resolvers:');
    }

    /**
     * Adding custom mutations
     */

    if (options.customMutations) {
        const createdMutations: any = {};

        for (const key in options.customMutations) {
            console.log(`Mutation ${key}`);
            createdMutations[key] = schemaComposer.createResolver(options.customMutations[key]);
        }

        schemaComposer.Mutation.addFields(createdMutations);
    }

    /**
     * Adding custom queries
     */

    if (options.customQueries) {
        const createdQueries: any = {};

        for (const key in options.customQueries) {
            console.log(`Query ${key}`);
            createdQueries[key] = schemaComposer.createResolver(options.customQueries[key]);
        }

        schemaComposer.Query.addFields(createdQueries);
    }

    /**
     * Building schema
     */

    const schema = schemaComposer.buildSchema();

    return { schemaComposer, schema, pubsub };
}

/**
 * Generates query and mitations for type composer
 */

enum SubscriptionType {
    Create = 'Create',
    Update = 'Update',
    Remove = 'Remove'
}

function getGraphqlAttrs<TDoc extends Document, TContext = any>(
    model: Model<TDoc>,
    typeComposer: ObjectTypeComposerWithMongooseResolvers<TDoc, TContext>,
    name: string,
    filteredProperties: string[],
    authConfig: EntityAuthConfig
): GraphqlAttrs {
    const operators: any = { _ids: true };
    if (filteredProperties) {
        filteredProperties.forEach((property) => operators[property] = true);
    }

    const filterObj = { filter: { onlyIndexed: false, operators, requiredFields: [] } };

    /**
     * Queries
     */

    const query = {
        [`${name}ById`]: authQueryOneResolver(
            typeComposer.mongooseResolvers.findById(),
            authConfig
        ),
        [`${name}ByIds`]: authQueryByIdsResolver(
            typeComposer.mongooseResolvers.findByIds(),
            authConfig
        ),
        [`${name}One`]: authQueryWithFilterResolver(
            typeComposer.mongooseResolvers.findOne(filterObj),
            authConfig
        ),
        [`${name}Many`]: authQueryWithFilterResolver(
            typeComposer.mongooseResolvers.findMany(filterObj),
            authConfig
        ),
        [`${name}Count`]: authQueryWithFilterResolver(
            typeComposer.mongooseResolvers.count(filterObj),
            authConfig
        ),
        [`${name}Connection`]: authQueryWithFilterResolver(
            typeComposer.mongooseResolvers.connection(),
            authConfig
        ),
        [`${name}Pagination`]: authQueryWithFilterResolver(
            typeComposer.mongooseResolvers.pagination(),
            authConfig
        )
    };

    /**
     * Mutations
     */

    const updateById = typeComposer.mongooseResolvers.updateById({ record: { allFieldsNullable: true } });
    const updateOne = typeComposer.mongooseResolvers.updateOne({ ...filterObj, record: { allFieldsNullable: true } });

    const mutation = {
        [`${name}CreateOne`]:
            wrapCreateAuth(
                wrapResolverWithSubscription(
                    typeComposer.mongooseResolvers.createOne(),
                    SubscriptionType.Create, name
                ),
                authConfig
            ),
        [`${name}CreateMany`]:
            wrapCreateAuth(
                wrapResolverWithSubscription(
                    typeComposer.mongooseResolvers.createMany(),
                    SubscriptionType.Create, name
                ),
                authConfig
            ),

        [`${name}UpdateById`]:
            wrapMutationAuth(
                wrapResolverWithSubscription(
                    updateById,
                    SubscriptionType.Update, name
                ),
                authConfig, typeComposer.mongooseResolvers.findById()
            ),
        [`${name}UpdatePartialById`]:
            wrapMutationAuth(
                wrapResolverWithSubscription(
                    wrapResolverWithPreFetchOne(
                        updateById,
                        typeComposer.mongooseResolvers.findById()
                    ),
                    SubscriptionType.Update, name
                ),
                authConfig, typeComposer.mongooseResolvers.findById()
            ),
        [`${name}UpdateByIdEach`]:
            authMutationByIdsEach(
                wrapResolverWithSubscription(
                    updateByIdEach(model, typeComposer),
                    SubscriptionType.Update, name
                ),
                authConfig, typeComposer.mongooseResolvers.findByIds()
            ),
        [`${name}UpdatePartialByIdEach`]:
            authMutationByIdsEach(
                wrapResolverWithSubscription(
                    wrapResolverWithPreFetchByIds(
                        updateByIdEach(model, typeComposer),
                        typeComposer.mongooseResolvers.findMany()
                    ),
                    SubscriptionType.Update, name
                ),
                authConfig, typeComposer.mongooseResolvers.findByIds()
            ),
        [`${name}UpdateOne`]:
            wrapMutationWithFilterAuth(
                updateOne,
                authConfig, typeComposer.mongooseResolvers.findOne()
            ),
        [`${name}PartialUpdateOne`]:
            wrapMutationWithFilterAuth(
                wrapResolverWithSubscription(
                    wrapResolverWithPreFetchOne(
                        updateOne,
                        typeComposer.mongooseResolvers.findOne(filterObj)
                    ),
                    SubscriptionType.Update, name
                ),
                authConfig, typeComposer.mongooseResolvers.findOne()
            ),
        [`${name}UpdateMany`]:
            wrapMutationWithFilterAuth(
                typeComposer.mongooseResolvers.updateMany(filterObj),
                authConfig, typeComposer.mongooseResolvers.findMany()
            ),

        [`${name}RemoveById`]:
            wrapMutationAuth(
                wrapResolverWithSubscription( // one id
                    typeComposer.mongooseResolvers.removeById(),
                    SubscriptionType.Remove, name
                ),
                authConfig, typeComposer.mongooseResolvers.findById()
            ),
        [`${name}RemoveOne`]:
            wrapMutationAuth(
                typeComposer.mongooseResolvers.removeOne(filterObj),
                authConfig, typeComposer.mongooseResolvers.findOne()
            ),
        [`${name}RemoveMany`]:
            wrapMutationAuth(
                typeComposer.mongooseResolvers.removeMany(filterObj),
                authConfig, typeComposer.mongooseResolvers.findMany()
            )
    };

    const subscriptions = {
        [`${name}${SubscriptionType.Create}`]: getSubscriptionForResolver(`${name}${SubscriptionType.Create}`, typeComposer),
        [`${name}${SubscriptionType.Update}`]: getSubscriptionForResolver(`${name}${SubscriptionType.Update}`, typeComposer),
        [`${name}${SubscriptionType.Remove}`]: getSubscriptionForResolver(`${name}${SubscriptionType.Remove}`, typeComposer)
    };

    return { query, mutation, subscriptions };
}

function wrapResolverWithSubscription(resolver: Resolver, subscriptionType: SubscriptionType, name: string) {
    return resolver.wrapResolve((next) => async (rp) => {
        const res = await next(rp);

        if (res?.records) {
            res?.records.forEach((record: any) => pubsub.publish(`${name}${subscriptionType}`, record));
        } else if (res?.record) {
            pubsub.publish(`${name}${subscriptionType}`, res.record);
        }

        return res;
    });
}

function wrapResolverWithPreFetchByIds(resolver: Resolver, findMany: any) {
    return resolver.wrapResolve((next) => async (rp: any) => {
        const ids = rp.args.records.map((record) => record._id);

        const result = await findMany.resolve({
            projection: {},
            args: {
                filter: {
                    _operators: {
                        _id: {
                            in: ids
                        }
                    }
                }
            }
        });

        const fullRecords = _.merge(result, rp.args.records);

        rp.args.records = fullRecords;

        return next(rp);
    });
}

function wrapResolverWithPreFetchOne(resolver: Resolver, prefetchFunction: any) {
    return resolver.wrapResolve((next) => async (rp: any) => {
        const result = await prefetchFunction.resolve({ ...rp, projection: {} });
        const fullRecord = _.merge(result, rp.args.record);
        rp.args.record = fullRecord;

        return next(rp);
    });
}

function getSubscriptionForResolver(name: string, typeComposer: any) {
    return {
        type: typeComposer,
        resolve: (payload: any) => payload,
        subscribe: () => pubsub.asyncIterator(name)
    };
}
