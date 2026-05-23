let io;

export function initSocket(server) {
  io = server;
  return io;
}

export function getSocket() {
  return io;
}

export function emitEvent(event, payload) {
  if (io) {
    io.emit(event, payload);
  }
}
