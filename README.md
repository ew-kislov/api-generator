# GraphQL API generator

Generates GraphQL API + mongodb from classes

## Documentation

### Classes

Specify your classes in typescript with the following decorators:

1. Typegoose decorators
    - [modelOptions](https://typegoose.github.io/typegoose/docs/api/decorators/model-options/) - class decorator
    - [prop](https://typegoose.github.io/typegoose/docs/api/decorators/prop/) - property decorator
2. GrahQL API generator decorators
    - `Entity(name: string)` - marks class to be scanned by GraphQL API generator
    - `Nested({ refProperty: string; refEntity: () => Type; many: boolean; })` - marks propery as nested object(or array of objects) based on typegoose @prop ref(see examples below for more details)
    - `Filtered` - marks property as the filtered by GraphQL filter operations(neq, gt, lt etc)

**Examples:**

Basic nesting:

```
import { modelOptions, prop, Ref } from '@typegoose/typegoose';
import { Entity, Nested, Filtered } from '@mmo.delivery/graphql-generator';

@Entity('A')
@modelOptions({ schemaOptions: { strict: true, timestamps: true } })
export class A {
  _id?: string;

  @Filtered()
  @prop({ ref: () => B, autopopulate: true, required: true })
  bId?: Ref<B>;

  @Nested({
    refProperty: 'bId',
    refEntity: () => B,
    many: false,
  })
  b!: B;

  @Filtered()
  @prop()
  createdAt?: Date;

  @Filtered()
  @prop()
  updatedAt?: Date;
}

@Entity('B')
@modelOptions({ schemaOptions: { strict: true, timestamps: true } })
export class B {
  _id?: string;

  @prop()
  name: string;

  @Filtered()
  @prop()
  createdAt?: Date;

  @Filtered()
  @prop()
  updatedAt?: Date;
}
```

If you want to use enum property:

```
@prop({ enum: ESomeEnum, type: String })
someEnumerableProperty!: ESomeEnum;
```

### Running API server

To run server you should execute function runGraphqlFromInterfaces with options:

```
interface Options<T> {
    app: express.Application;
    mongodbUrl: string;
    interfaces: T[];
    port: number;
    path?: string;
    maxBodySize?: string | number; // works like app.use(json({ limit: 'value' }))
    customInterfaceQueries?: InterfaceResolvers[];
    customInterfaceMutations?: InterfaceResolvers[];
    customMutations?: { [key: string]: ResolverDefinition<any, any> };
    customQueries?: { [key: string]: ResolverDefinition<any, any> };
}
```

InterfaceResolvers are declared as:
```
interface InterfaceResolvers<T = any> {
    interface: new () => T;
    resolvers: { [key: string]: (type: ObjectTypeComposer, mongooseModel: mongoose.Model<T>) => ResolverDefinition<any, any> };
}
```

interface ResolverDefinition is declared in graphql-compose library

**Examples:**

Run this example code as your GraphQL server:

```
import dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import { runGraphqlFromInterfaces } from '@mmo.delivery/graphql-generator';

dotenv.config();

const app = express();

/**
 * add here any middlewares and other server config
 */

runGraphqlFromInterfaces({
    app,
    mongodbUrl: process.env.MONGODB_URL,
    port: process.env.PORT,
    path: '/',
    interfaces: [A, B]
});
```

If you want to create custom query/mutation for some interface you can do following:

```
const customInterfaceQueries = [
    {
        interface: B,
        resolvers: {
            SomeBQuery: (type, mongooseModel) => ({
                name: 'SomeBQuery',
                type,
                args: { someParam: 'String!' },
                resolve: async (params: any) => {
                    // TODO: db calls through mongooseModel
                    return {
                        name: params.args.someParam
                    };
                }
            })
        }
    }
];

const customInterfaceMutations = [
    {
        interface: B,
        resolvers: {
            SomeBMutation: (type, mongooseModel) => ({
                name: 'SomeBMutation',
                type,
                args: { someParam: 'String!' },
                resolve: async (params: any) => {
                    // TODO: db calls through mongooseModel
                    return {
                        name: params.args.someParam
                    };
                }
            })
        }
    }
];

runGraphqlFromInterfaces({
    app,
    mongodbUrl: process.env.MONGODB_URL,
    port: process.env.PORT,
    path: '/',
    interfaces: [A, B],
    customInterfaceQueries,
    customInterfaceMutations
});
```

If you want to create custom queries/mutations not based on your interfaces you can do following:

```
const customMutations = {
    SomeMutation: {
        name: 'SomeMutation',
        type: `type SomeType { param: String! }`,
        args: { param: 'String!' },
        resolve: async (params: any) => {
            // TODO: some api/db call here
            return {
                param: params.args.param
            };
        }
    }
};

const customQueries = {
    SomeQuery: {
        name: 'SomeQuery',
        type: `type SomeOtherType { param2: String! }`,
        args: { param2: 'String!' },
        resolve: async (params: any) => {
            // TODO: some api/db call here
            return {
                param2: params.args.param2
            };
        }
    }
};

runGraphqlFromInterfaces({
    app,
    mongodbUrl: process.env.MONGODB_URL,
    port: process.env.PORT,
    path: '/',
    interfaces: [A, B],
    customMutations,
    customQueries,
});
```

### Permissions handling

Generator supports 4 types of permissons:
1) Read self
2) Read all
3) Write self
4) Write all

To add auth config to particular interface, add decorator(user and admin roles as examples):

```
@Auth({
    userIdField: 'userId',
    writeAll: ['admin'],
    readAll: ['admin'],
    writeSelf: ['user'],
    readSelf: ['user']
})
```