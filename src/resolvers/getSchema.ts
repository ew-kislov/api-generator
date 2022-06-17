import fsp from 'fs/promises';

import { ObjectTypeComposer } from "graphql-compose";

const basicTypes = [
    'Boolean',
    'Float',
    'Int',
    'MongoID',
    'String',
];

const basicRequiredTypes = [
    'Boolean!',
    'Float!',
    'Int!',
    'MongoID!',
    'String!'
];

export function getFieldsFromTypeComposer(typeComposer: ObjectTypeComposer) {
    const object = {};

    const fields = typeComposer.getFieldNames();

    for (const field of fields) {
        const type = typeComposer.getFieldType(field).toString();
        if (basicTypes.includes(type)) {
            object[field] = {
                type,
                nullable: true
            };
        } else if (basicRequiredTypes.includes(type)) {
            object[field] = {
                type: type.slice(0, -1), // remove '!' from type name
                nullable: false
            };
        } else {
            const actualType = type.slice(-1) === '!' ? type.slice(0, -1) : type;
            const nestedTypeComposer: ObjectTypeComposer = typeComposer.getFieldOTC(field);

            object[field] = {
                type: actualType,
                
            }
        }
    }

    // console.log(typeComposer.getFields());
    // console.log(typeComposer.getFieldType('int1'));
    // console.log(typeComposer.getFieldType('inner'));
    // console.log(typeComposer.getFieldType('_id'));

    return object;
}
