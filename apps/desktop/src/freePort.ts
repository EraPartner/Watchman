import { createServer, AddressInfo } from 'net';

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        server.close();
        reject(new Error('Failed to acquire free port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
