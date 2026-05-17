// Vercel serverless entrypoint — wraps Express app
import app from '../api-src/server.js';

export default function handler(req, res) {
  return app(req, res);
}
