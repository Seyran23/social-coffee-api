import type { AddressInfo } from 'net';

import type { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';

/**
 * Returns the base URL the test app is listening on.
 * Requires the app to have been started with app.listen() (not app.init()).
 */
export function getAppUrl(app: INestApplication): string {
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://localhost:${port}`;
}

/**
 * Creates a socket.io client connected to the given namespace.
 * Returns the socket only after the 'connect' event fires.
 * Throws if connection fails (e.g. auth middleware rejects the token).
 */
export function connectSocket(
  app: INestApplication,
  namespace: string,
  token: string,
): Promise<Socket> {
  const url = `${getAppUrl(app)}${namespace}`;

  const socket = io(url, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
  });

  return new Promise<Socket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', err => reject(err));
    socket.connect();
  });
}

/**
 * Waits up to `timeoutMs` for a single emission of `event` on `socket`.
 * Rejects with a descriptive timeout error if the event never fires.
 */
export function waitForEvent<T = any>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Timeout (${timeoutMs}ms) waiting for event "${event}"`),
        ),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Gracefully disconnects a socket if it is still connected.
 */
export function disconnectSocket(socket: Socket): void {
  if (socket.connected) {
    socket.disconnect();
  }
}
