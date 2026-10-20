import { crc32, deflateSync } from "node:zlib";

// Always override inherited credentials before dynamically importing application modules.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/modofriki_test?sslmode=disable",
  MONGODB_URI: "mongodb://127.0.0.1:1/modofriki_test",
  JWT_SECRET: "isolated-test-secret-with-at-least-32-characters",
  BCRYPT_SALT_ROUNDS: "4",
  BLOB_READ_WRITE_TOKEN: "",
  LOG_LEVEL: "error"
});

export async function withServer(app: any, run: (base: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error: Error | undefined) => error ? reject(error) : resolve()));
  }
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
// Complete one-pixel RGBA PNG, including a real zlib raster and valid chunk checksums.
export const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", Buffer.from("00000001000000010806000000", "hex")),
  chunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
  chunk("IEND", Buffer.alloc(0))
]);
