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

/**
 * Upload a Buffer directly to Cloudinary (used for server-side voice note uploads).
 * Returns the secure delivery URL.
 */
export async function uploadBuffer(
  buffer: Buffer,
  options: {
    folder:         string;
    resource_type?: 'image' | 'video' | 'raw' | 'auto';
    public_id?:     string;
    overwrite?:     boolean;
    format?:        string;
    transformation?: Record<string, unknown>[];
  },
): Promise<string> {
  const c = ensureConfigured();

  return new Promise<string>((resolve, reject) => {
    const uploadStream = c.uploader.upload_stream(
      {
        folder:         options.folder,
        resource_type:  options.resource_type ?? 'auto',
        public_id:      options.public_id,
        overwrite:      options.overwrite ?? false,
        format:         options.format,
        transformation: options.transformation,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve(result.secure_url);
      },
    );
    uploadStream.end(buffer);
  });
}
