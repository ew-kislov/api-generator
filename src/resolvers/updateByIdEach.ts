import { ObjectTypeComposer, InterfaceTypeComposer } from 'graphql-compose';
import { recordHelperArgs } from 'graphql-compose-mongoose/lib/resolvers/helpers';
import type { Model, Document } from 'mongoose';

interface TArgs {
    records: any[];
}

export function updateByIdEach<TSource = any, TContext = any, TDoc extends Document = any>(
    model: Model<TDoc>,
    tc: ObjectTypeComposer<TDoc, TContext> | InterfaceTypeComposer<TDoc, TContext>
) {
    const outputTypeName = `UpdateByIdEach${tc.getTypeName()}Payload`;
    const outputType = tc.schemaComposer.getOrCreateOTC(outputTypeName, (t) => {
        t.setFields({
            records: {
                type: tc.NonNull.List,
                description: 'Updated documents',
            },
            updatedCount: {
                type: 'Int!',
                description: 'Number of updated documents',
                resolve: (s: any) => s.updatedCount || 0,
            },
        });
    });

    const resolver = tc.schemaComposer.createResolver<TSource, TArgs>({
        name: 'updateEach',
        kind: 'mutation',
        description: 'Update each document with its value',
        type: outputType,
        args: {
            records: {
                type: (
                    recordHelperArgs(tc, {
                        prefix: 'UpdateByIdEach',
                        suffix: `Input`,
                        isRequired: true,
                        allFieldsNullable: true,
                        requiredFields: ['_id'],
                    }) as any
                ).record.type.List.NonNull,
            },
        },
        resolve: async (resolveParams) => {
            const recordData = resolveParams?.args?.records;

            if (!Array.isArray(recordData) || recordData.length === 0) {
                throw new Error(
                    `${tc.getTypeName()}.updateEach resolver requires args.records to be an Array and must contain at least one record`
                );
            }

            for (const record of recordData) {
                if (!(typeof record === 'object') || Object.keys(record).length === 0) {
                    throw new Error(
                        `${tc.getTypeName()}.updateEach resolver requires args.records to contain non-empty records, with at least one value`
                    );
                }
            }

            const docs = [] as TDoc[];
            for (const record of recordData) {
                let doc = new model(record);
                if (resolveParams.beforeRecordMutate) {
                    doc = await resolveParams.beforeRecordMutate(doc, resolveParams);
                }
                docs.push(doc);
            }

            const records = await Promise.all(docs.map(async (doc) => {
                await model.findByIdAndUpdate(doc._id, doc as any);
                const updatedRecord = await model.findById(doc._id);
                return updatedRecord;
            }));

            return {
                records,
                updatedCount: docs.length,
            };
        }
    });

    return resolver;
}
