/**
 * Unified WebP conversion function
 * Ensures Live Preview and Convert All use exactly the same conversion logic
 */
export async function convertImageToWebP(file: File, quality: number): Promise<Blob> {
	// Use createImageBitmap as the preferred method (faster and more consistent)
	const bitmap = await createImageBitmap(file).catch(() => null);

	if (bitmap) {
		// Primary method: createImageBitmap
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas not supported');

		// Ensure consistent rendering parameters
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('Blob conversion failed'))),
				'image/webp',
				quality
			);
		});

		// Clean up resources
		bitmap.close();
		return blob;
	}

	// Fallback method: Image element
	const img = new Image();
	img.decoding = 'async';
	img.loading = 'eager';
	img.src = URL.createObjectURL(file);
	await img.decode();

	const canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas not supported');

	// Ensure consistent rendering parameters
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Blob conversion failed'))),
			'image/webp',
			quality
		);
	});

	// Clean up resources
	URL.revokeObjectURL(img.src);
	return blob;
}
