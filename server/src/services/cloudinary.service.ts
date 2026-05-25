import { v2 as cloudinary } from 'cloudinary';
import { env } from '../utils/env.js';

let configured = false;

function ensureConfigured(): typeof cloudinary {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/** Generate a signed payload the client uses to upload a profile photo directly. */
export function signUpload(folder = 'rightnow/profiles'): {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
} {
  const c = ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = c.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET as string,
  );
  return {
    timestamp,
    signature,
    apiKey: env.CLOUDINARY_API_KEY as string,
    cloudName: env.CLOUDINARY_CLOUD_NAME as string,
    folder,
  };
}
