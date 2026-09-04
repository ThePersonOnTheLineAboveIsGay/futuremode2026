/**
 * Tiny TLS-terminating reverse proxy for LiveKit.
 *
 * Listens on :7880 (HTTPS / WSS), forwards to LiveKit on :7881 (plain HTTP / WS).
 * Needed because LiveKit 1.9.x doesn't support signaling-server TLS natively.
 *
 * For production, replace with Caddy / nginx / a real reverse proxy.
 */
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_PATH = path.resolve(__dirname, 'server.crt');
const KEY_PATH = path.resolve(__dirname, 'server.key');

const UPSTREAM_HOST = process.env.LK_UPSTREAM_HOST ?? 'localhost';
const UPSTREAM_PORT = Number(process.env.LK_UPSTREAM_PORT ?? 7881);
const LISTEN_PORT = Number(process.env.LK_LISTEN_PORT ?? 7880);

const KEY = fs.readFileSync(KEY_PATH);
const CERT = fs.readFileSync(CERT_PATH);

const server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
  const proxyReq = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`upstream error: ${err.message}`);
  });
  req.pipe(proxyReq);
});

// WebSocket upgrade → raw TCP tunnel to upstream.
// Browsers send: GET /path HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ...\r\n\r\n
// We forward verbatim.
server.on('upgrade', (req, clientSocket, head) => {
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    const reqLine = `${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`;
    upstream.write(reqLine);
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', (err) => {
    console.error('[proxy] upstream error:', err.message);
    clientSocket.destroy();
  });
  clientSocket.on('error', () => {
    upstream.destroy();
  });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(
    `[proxy] HTTPS listening on https://0.0.0.0:${LISTEN_PORT} → ws://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,
  );
});
