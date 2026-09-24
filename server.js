const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDirectory = __dirname;
const port = Number.parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '0.0.0.0';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });
  response.end(body);
}

function resolveFile(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(rootDirectory, relativePath);
  if (filePath !== rootDirectory && !filePath.startsWith(`${rootDirectory}${path.sep}`)) return null;
  return filePath;
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return send(response, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
  }

  let requestUrl;
  try {
    requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  } catch {
    return send(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
  }

  if (requestUrl.pathname === '/health') {
    return send(response, 200, JSON.stringify({ status: 'ok', service: 'porto-porto' }), 'application/json; charset=utf-8');
  }

  let filePath;
  try {
    filePath = resolveFile(requestUrl.pathname);
  } catch {
    return send(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
  }
  if (!filePath) return send(response, 403, 'Forbidden', 'text/plain; charset=utf-8');

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) return send(response, 404, 'Not Found', 'text/plain; charset=utf-8');
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(filePath).on('error', () => {
      if (!response.headersSent) send(response, 500, 'Internal Server Error', 'text/plain; charset=utf-8');
      else response.destroy();
    }).pipe(response);
  });
});

server.listen(port, host, () => {
  console.log(`Porto Porto listening on http://localhost:${port}`);
});
