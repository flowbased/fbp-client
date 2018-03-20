module.exports = client => ({
  send: (protocol, command, payload) => {
    console.log(client, protocol, command, payload);
  },
});
