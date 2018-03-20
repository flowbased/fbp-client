const { expect } = require('chai');
const client = require('../lib/client');

describe('FBP Client', () => {
  describe('when instantiated', () => {
    describe('without address', () => {
      it('should give an error', () => {
        return client({})
          .then(() => new Error('Unexpected success'))
          .catch((err) => {
            expect(err.message).to.contain('Runtime definition');
            expect(err.message).to.contain('should have required');
            expect(err.message).to.contain('address');
          });
      });
    });
    describe('without protocol', () => {
      it('should give an error if address can\'t be converted', () => {
        return client({
          address: 'smtp://localhost',
        })
          .then(() => new Error('Unexpected success'))
          .catch((err) => {
            expect(err.message).to.contain('protocol is required');
          });
      });
      it('should convert address to protocol for wss', () => {
        return client({
          address: 'wss://localhost:3569',
        })
          then((c) => {
            expect(c.definition.protocol).to.equal('websocket');
          });
      });
      it.skip('should convert address to protocol for https', () => {
        return client({
          address: 'https://noflojs.org',
        })
          then((c) => {
            expect(c.definition.protocol).to.equal('iframe');
          });
      });
    });
    describe('with unsupported protocol', () => {
      it('should give an error', () => {
        return client({
          address: 'smtp://localhost',
          protocol: 'smtp',
        })
          .then(() => new Error('Unexpected success'))
          .catch((err) => {
            expect(err.message).to.contain('Unsupported FBP transport');
          });
      });
    });
  });
  describe('when connecting', () => {
    describe('to non-existing local runtime', () => {
      it('should time out when timeout is short', () => {
        return client({
          address: 'ws://localhost:3569',
        }, {
          connectionTimeout: 1,
        })
          .then((c) => c.connect())
          .then(() => new Error('Unexpected success'))
          .catch((err) => {
            expect(err.message).to.contain('timed out');
          });
      });
      it('should give actual connection error when not timing out', () => {
        return client({
          address: 'ws://localhost:3569',
        }, {
          connectionTimeout: 1000,
        })
          .then((c) => c.connect())
          .then(() => new Error('Unexpected success'))
          .catch((err) => {
            expect(err.message).to.contain('ECONNREFUSED');
          });
      });
    });
  });
});
