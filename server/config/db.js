const mongoose = require('mongoose');

// In serverless environments (Vercel), functions can be invoked many times
// concurrently and the process can be reused between invocations. Creating a
// brand-new MongoDB connection on every request exhausts connections quickly,
// so we cache the connection (and in-flight connection promise) on the
// global object, which survives across warm invocations.
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI is not set. Add it to your environment variables.');
    }
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
