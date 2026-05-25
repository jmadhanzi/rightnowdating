interface Transform {
  width?: number;
  quality?: number | 'auto';
  format?: string;
}

/**
 * Insert Cloudinary transformation params into a delivery URL. Non-Cloudinary
 * URLs (or already-transformed ones) are returned unchanged.
 */
export function cloudinaryUrl(url: string | null | undefined, t: Transform): string {
  if (!url || !url.includes('/upload/')) return url ?? '';
  const parts: string[] = [];
  if (t.width) parts.push(`w_${t.width}`);
  parts.push(`q_${t.quality ?? 'auto'}`);
  parts.push(`f_${t.format ?? 'auto'}`);
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

/** Profile photo: 200px, auto quality/format. */
export const profilePhoto = (url: string | null | undefined): string =>
  cloudinaryUrl(url, { width: 200, quality: 'auto', format: 'auto' });

/** Message thumbnail: 400px, quality 70, auto format. */
export const messageThumb = (url: string | null | undefined): string =>
  cloudinaryUrl(url, { width: 400, quality: 70, format: 'auto' });
