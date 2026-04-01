import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI no está definida en .env.local");
}

/**
 * Cache global para evitar múltiples conexiones en desarrollo
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

/**
 * Conectar a MongoDB (helper reutilizable)
 */
export async function dbConnect() {
  // Si ya hay conexión, la reutiliza
  if (cached.conn) {
    return cached.conn;
  }

  // Si no hay promesa, crea una nueva conexión
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default dbConnect;