/* eslint no-underscore-dangle: ["error", { "allow": [ "_opts" ] }] */
const Ajv = require('ajv');
const draft04 = require('ajv/lib/refs/json-schema-draft-04.json');
const schemas = require('fbp-protocol/schema/schemas');

module.exports = () => {
  const ajv = new Ajv();
  // Required for draft-04 schemas provided by FBP Protocol
  ajv.addMetaSchema(draft04);
  ajv._opts.defaultMeta = 'http://json-schema.org/draft-04/schema#';
  // Register all schemas
  Object.keys(schemas).forEach((key) => {
    schemas[key].id = `/${key}/`;
    ajv.addSchema(schemas[key]);
  });
  return (path, payload) => new Promise((resolve, reject) => {
    const [protocol, type, command] = path.slice(1).split('/');
    const message = payload;
    message.protocol = protocol;
    if (ajv.validate(path, message)) {
      resolve(payload);
    }
    if (type === 'input') {
      reject(new Error(`Client sent invalid payload for ${protocol} ${command}: ${ajv.errorsText()}`));
    }
    reject(new Error(`Runtime sent invalid payload for ${protocol} ${command}: ${ajv.errorsText()}`));
  });
};
