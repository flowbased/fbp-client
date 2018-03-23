/* eslint no-underscore-dangle: ["error", { "allow": [ "_opts" ] }] */
const Ajv = require('ajv');
const draft04 = require('ajv/lib/refs/json-schema-draft-04.json');
const schemas = require('fbp-protocol/schema/schemas');
const definitionSchema = require('../schema/definition.json');

module.exports = () => {
  const ajv = new Ajv({
    extendRefs: true,
  });
  // Required for draft-04 schemas provided by FBP Protocol
  ajv.addMetaSchema(draft04);
  ajv._opts.defaultMeta = 'http://json-schema.org/draft-04/schema#';
  // Register all schemas
  Object.keys(schemas).forEach((key) => {
    schemas[key].id = `/${key}/`;
    ajv.addSchema(schemas[key]);
  });
  ajv.addSchema(definitionSchema);
  return (path, payload) => new Promise((resolve, reject) => {
    const [protocol, type, command] = path.slice(1).split('/');
    if (!type) {
      if (ajv.validate(path, payload)) {
        resolve(payload);
        return;
      }
      reject(new Error(`Runtime definition ${ajv.errorsText()}`));
      return;
    }
    const message = payload;
    message.protocol = protocol;
    if (ajv.validate(path, message)) {
      resolve(payload);
      return;
    }
    if (type === 'input') {
      reject(new Error(`Client sent invalid payload for ${protocol}:${command}: ${ajv.errorsText()}`));
      return;
    }
    reject(new Error(`Runtime sent invalid payload for ${protocol}:${command}: ${ajv.errorsText()}`));
  });
};
