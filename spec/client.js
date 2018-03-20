const { expect } = require('chai');
const client = require('../lib/client');

describe('FBP Client', () => {
  describe('when instantiated', () => {
    describe('without address', () => {
      it('should give an error', () => {
        return client({})
          .catch((err) => {
            expect(err.message).to.contain('address is required');
          });
      });
    });
    describe('without protocol', () => {
      it('should give an error if address can\'t be converted', () => {
        return client({
          address: 'smtp://localhost',
        })
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
      it('should convert address to protocol for https', () => {
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
          .catch((err) => {
            expect(err.message).to.contain('Unsupported FBP transport');
          });
      });
    });
  });
});
