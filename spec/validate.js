const { expect } = require('chai');
const validate = require('../lib/validate')();

describe('FBP Protocol message validation', () => {
  describe('validating input', () => {
    it('should resolve on valid payload', () => {
      const payload = {
        command: 'packet',
        payload: {
          port: 'foo',
          event: 'connect',
          graph: 'bar',
        },
      };
      return validate('/runtime/input/packet', payload);
    });
    it('should return correct error for invalid payload', () => {
      const payload = {
        command: 'packet',
        payload: {
          port: 'foo',
          event: 'connect',
        },
      };
      return validate('/runtime/input/packet', payload)
        .then(() => new Error('Unexpected success'))
        .catch((err) => {
          expect(err.message).to.contain('Client sent invalid');
          expect(err.message).to.contain('graph');
        });
    });
  });
  describe('validating output', () => {
    it('should resolve on valid payload', () => {
      const payload = {
        command: 'ports',
        payload: {
          graph: 'bar',
          inPorts: [],
          outPorts: [],
        },
      };
      return validate('/runtime/output/ports', payload);
    });
    it('should return correct error for invalid payload', () => {
      const payload = {
        command: 'ports',
        payload: {
          inPorts: [],
          outPorts: [],
        },
      };
      return validate('/runtime/output/ports', payload)
        .then(() => new Error('Unexpected success'))
        .catch((err) => {
          expect(err.message).to.contain('Runtime sent invalid');
          expect(err.message).to.contain('graph');
        });
    });
  });
});
