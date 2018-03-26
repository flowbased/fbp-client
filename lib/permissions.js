/* eslint no-underscore-dangle: ["error", { "allow": [ "_enumDescriptions" ] }] */
const schemas = require('fbp-protocol/schema/schemas');

function getAllowingCapabilities(protocol, command, input = true) {
  const capabilityDefinitions = schemas.shared.capabilities.items._enumDescriptions;
  return capabilityDefinitions.filter((capability) => {
    if (input) {
      if (!capability.inputs || !capability.inputs.length) {
        return false;
      }
      return (capability.inputs.indexOf(`${protocol}:${command}`) !== -1);
    }
    if (!capability.outputs || !capability.outputs.length) {
      return false;
    }
    return (capability.outputs.indexOf(`${protocol}:${command}`) !== -1);
  }).map(capability => capability.name);
}

exports.canSend = (protocol, command, capabilities) => {
  if (protocol === 'runtime' && command === 'getruntime') {
    return true;
  }
  const allowedVia = getAllowingCapabilities(protocol, command, true);
  const allowing = capabilities.filter(c => allowedVia.indexOf(c) !== -1);
  return (allowing.length > 0);
};

exports.canReceive = (protocol, command, capabilities) => {
  if (protocol === 'runtime' && command === 'runtime') {
    return true;
  }
  const allowedVia = getAllowingCapabilities(protocol, command, false);
  const allowing = capabilities.filter(c => allowedVia.indexOf(c) !== -1);
  return (allowing.length > 0);
};
