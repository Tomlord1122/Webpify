<script lang="ts">
	import { onMount } from 'svelte';
	import { convertImageToWebP } from './imageConverter.js';

	interface Props {
		originalFile: File;
		quality: number;
		onWebPGenerated?: (blob: Blob, size: number) => void;
	}

	let { originalFile, quality, onWebPGenerated }: Props = $props();

	let containerRef = $state<HTMLDivElement>();
	let isDragging = $state(false);
	let dividerPosition = $state(50); // percentage
	let originalUrl = $state('');
	let webpUrl = $state('');
	let originalSize = $state(0);
	let webpSize = $state(0);
	let isLoading = $state(true);
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let lastPanX = $state(0);
	let lastPanY = $state(0);
	let hasInteracted = $state(false);

	// Generate URLs and WebP conversion
	$effect(() => {
		if (!originalFile) return;

		// Set original
		originalUrl = URL.createObjectURL(originalFile);
		originalSize = originalFile.size;
		isLoading = true;

		(async () => {
			try {
				// Convert to WebP using shared function
				const webpBlob = await convertImageToWebP(originalFile, quality);
				webpUrl = URL.createObjectURL(webpBlob);
				webpSize = webpBlob.size;

				// Notify parent component
				onWebPGenerated?.(webpBlob, webpBlob.size);
			} catch (err) {
				console.error('WebP conversion failed:', err);
			} finally {
				isLoading = false;
			}
		})();
	});

	// Re-convert when quality changes
	$effect(() => {
		if (!originalFile || quality === undefined) return;

		(async () => {
			try {
				const webpBlob = await convertImageToWebP(originalFile, quality);
				if (webpUrl) URL.revokeObjectURL(webpUrl);
				webpUrl = URL.createObjectURL(webpBlob);
				webpSize = webpBlob.size;
				onWebPGenerated?.(webpBlob, webpBlob.size);
			} catch (err) {
				console.error('WebP re-conversion failed:', err);
			}
		})();
	});

	function handleMouseDown(event: MouseEvent) {
		event.stopPropagation(); // Prevent image panning
		event.preventDefault();
		isDragging = true;
		updateDividerPosition(event);
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		updateDividerPosition(event);
	}

	function handleMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
	}

	function updateDividerPosition(event: MouseEvent) {
		if (!containerRef) return;
		const rect = containerRef.getBoundingClientRect();
		const percentage = ((event.clientX - rect.left) / rect.width) * 100;
		dividerPosition = Math.max(5, Math.min(95, percentage));
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}

	function getSavingsPercentage(): number {
		if (originalSize === 0 || webpSize === 0) return 0;
		return Math.round(((originalSize - webpSize) / originalSize) * 100);
	}

	// Zoom and pan functionality
	function handleWheel(event: WheelEvent) {
		// For macOS trackpad: Only respond to pinch gestures (Ctrl+wheel)
		// For mouse: Respond to wheel with some modifier key to avoid accidental zoom
		const isIntentionalZoom =
			event.ctrlKey || // Pinch gesture or Ctrl+scroll
			event.metaKey || // Cmd+scroll on macOS
			event.altKey; // Alt+scroll

		if (isIntentionalZoom) {
			event.preventDefault();
			hasInteracted = true; // Mark that user has interacted with the component

			const delta = -event.deltaY; // Invert for natural direction
			const scaleFactor = delta > 0 ? 1.1 : 0.9;
			const newScale = Math.max(0.5, Math.min(3, scale * scaleFactor));

			if (newScale !== scale) {
				scale = newScale;
				// Reset pan when zooming out to 1x
				if (scale === 1) {
					panX = 0;
					panY = 0;
				}
			}
		}
		// For regular scroll without modifier keys, do nothing (allow page scroll)
	}

	function handleImageMouseDown(event: MouseEvent) {
		// Don't start panning if we're clicking on the divider
		if ((event.target as HTMLElement).closest('[data-divider]')) {
			return;
		}

		hasInteracted = true; // Mark that user has interacted with the component

		if (scale <= 1) return; // Only allow panning when zoomed in

		isPanning = true;
		lastPanX = event.clientX;
		lastPanY = event.clientY;

		document.addEventListener('mousemove', handleImageMouseMove);
		document.addEventListener('mouseup', handleImageMouseUp);
		event.preventDefault();
	}

	function handleImageMouseMove(event: MouseEvent) {
		if (!isPanning) return;

		const deltaX = event.clientX - lastPanX;
		const deltaY = event.clientY - lastPanY;

		panX += deltaX;
		panY += deltaY;

		lastPanX = event.clientX;
		lastPanY = event.clientY;
	}

	function handleImageMouseUp() {
		isPanning = false;
		document.removeEventListener('mousemove', handleImageMouseMove);
		document.removeEventListener('mouseup', handleImageMouseUp);
	}

	function resetZoom() {
		scale = 1;
		panX = 0;
		panY = 0;
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Only handle keys when this component has focus or when explicitly targeting this element
		if (!containerRef?.contains(event.target as Element) && event.target !== containerRef) {
			return;
		}

		hasInteracted = true; // Mark interaction

		// Handle keyboard navigation for accessibility
		switch (event.key) {
			case 'Enter':
				// Reset zoom on Enter - force focus first to ensure it works
				if (containerRef) {
					containerRef.focus();
				}
				resetZoom();
				event.preventDefault();
				event.stopPropagation();
				break;
			case ' ':
				// Reset zoom on Space - only if no other element is focused
				if (
					document.activeElement === containerRef ||
					containerRef?.contains(document.activeElement)
				) {
					resetZoom();
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case '+':
			case '=':
				// Zoom in
				scale = Math.min(3, scale * 1.1);
				event.preventDefault();
				event.stopPropagation();
				break;
			case '-':
				// Zoom out
				scale = Math.max(0.5, scale * 0.9);
				if (scale === 1) {
					panX = 0;
					panY = 0;
				}
				event.preventDefault();
				event.stopPropagation();
				break;
			case 'ArrowLeft':
				if (scale > 1) {
					panX += 20;
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case 'ArrowRight':
				if (scale > 1) {
					panX -= 20;
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case 'ArrowUp':
				if (scale > 1) {
					panY += 20;
					event.preventDefault();
					event.stopPropagation();
				}
				break;
			case 'ArrowDown':
				if (scale > 1) {
					panY -= 20;
					event.preventDefault();
					event.stopPropagation();
				}
				break;
		}
	}

	// Global keyboard handler for Enter key reset
	function handleGlobalKeyDown(event: KeyboardEvent) {
		// Only handle Enter key for reset when component has been interacted with
		if (event.key === 'Enter' && hasInteracted && (scale !== 1 || panX !== 0 || panY !== 0)) {
			// Make sure we're not interfering with form inputs or other interactive elements
			const target = event.target as HTMLElement;
			if (
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'BUTTON' ||
				target.isContentEditable
			) {
				return;
			}

			resetZoom();
			event.preventDefault();
		}
	}

	onMount(() => {
		// Add global keyboard listener for Enter key
		document.addEventListener('keydown', handleGlobalKeyDown);

		return () => {
			if (originalUrl) URL.revokeObjectURL(originalUrl);
			if (webpUrl) URL.revokeObjectURL(webpUrl);
			document.removeEventListener('keydown', handleGlobalKeyDown);
		};
	});
</script>

<div class="flex h-full flex-col rounded-lg border border-gray-300 bg-white shadow-sm">
	<div class="flex-shrink-0 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h3 class="font-serif text-lg font-medium text-gray-900">Live Preview</h3>
			{#if !isLoading && originalUrl && webpUrl}
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-600">{Math.round(scale * 100)}%</span>
					<button
						type="button"
						onclick={resetZoom}
						class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
						disabled={scale === 1 && panX === 0 && panY === 0}
					>
						Reset
					</button>
				</div>
			{/if}
		</div>

		{#if isLoading}
			<div
				class="flex h-64 items-center justify-center rounded-md bg-gray-50 transition-opacity duration-300"
			>
				<div class="text-center">
					<div
						class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
					></div>
					<p class="mt-2 text-sm text-gray-600">Converting...</p>
				</div>
			</div>
		{/if}
	</div>

	{#if !isLoading && originalUrl && webpUrl}
		<!-- Image Comparison Container -->
		<div class="flex-1 p-4 pt-0">
			<div
				bind:this={containerRef}
				class="relative h-full min-h-96 overflow-hidden rounded-md border border-gray-200 cursor-{scale >
				1
					? 'grab'
					: 'default'}"
				onwheel={handleWheel}
				onmousedown={handleImageMouseDown}
				onkeydown={handleKeyDown}
				style="cursor: {isPanning ? 'grabbing' : scale > 1 ? 'grab' : 'default'}"
				role="button"
				aria-label="Interactive image comparison viewer - pinch or Cmd+scroll to zoom, drag to pan when zoomed in, use +/- to zoom, arrows to pan, Enter to reset"
				tabindex="0"
			>
				<!-- Original Image (Left Side) -->
				<div
					class="absolute inset-0 overflow-hidden"
					style="clip-path: inset(0 {100 - dividerPosition}% 0 0);"
				>
					<img
						src={originalUrl}
						alt="Original"
						class="h-full w-full object-cover transition-transform duration-150"
						style="transform: scale({scale}) translate({panX}px, {panY}px); transform-origin: center;"
						draggable="false"
					/>
				</div>

				<!-- WebP Image (Right Side) -->
				<div
					class="absolute inset-0 overflow-hidden"
					style="clip-path: inset(0 0 0 {dividerPosition}%);"
				>
					<img
						src={webpUrl}
						alt="WebP compressed"
						class="h-full w-full object-cover transition-transform duration-150"
						style="transform: scale({scale}) translate({panX}px, {panY}px); transform-origin: center;"
						draggable="false"
					/>
				</div>

				<!-- Draggable Divider -->
				<div
					class="absolute top-0 z-10 h-full w-1 cursor-col-resize bg-white shadow-lg transition-shadow hover:shadow-xl"
					style="left: {dividerPosition}%;"
					onmousedown={handleMouseDown}
					data-divider="true"
					role="slider"
					tabindex="0"
					aria-label="Adjust comparison position"
					aria-valuemin="5"
					aria-valuemax="95"
					aria-valuenow={Math.round(dividerPosition)}
				>
					<!-- Drag Handle -->
					<div
						class="absolute top-1/2 left-1/2 h-8 w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow-md"
						data-divider="true"
					>
						<div class="flex h-full items-center justify-center" data-divider="true">
							<div class="h-4 w-0.5 bg-gray-400"></div>
							<div class="ml-1 h-4 w-0.5 bg-gray-400"></div>
						</div>
					</div>
				</div>

				<!-- Labels -->
				<div class="absolute top-2 left-2 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white">
					Original
				</div>
				<div class="absolute top-2 right-2 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white">
					WebP
				</div>

				<!-- Zoom Instructions -->
				{#if scale === 1}
					<div
						class="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 transform rounded bg-black/70 px-2 py-1 text-xs text-white"
					>
						Pinch or Cmd+scroll to zoom • Drag divider to compare • +/- keys to zoom
					</div>
				{:else}
					<div
						class="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 transform rounded bg-black/70 px-2 py-1 text-xs text-white"
					>
						Drag to move image • Arrow keys to pan • Enter to reset
					</div>
				{/if}
			</div>

			<!-- Stats -->
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div class="rounded-md bg-gray-50 p-3 text-center">
					<p class="text-xs text-gray-600">Original</p>
					<p class="font-medium text-gray-900">{formatBytes(originalSize)}</p>
				</div>
				<div class="rounded-md bg-gray-50 p-3 text-center">
					<p class="text-xs text-gray-600">WebP</p>
					<p class="font-medium text-gray-900">{formatBytes(webpSize)}</p>
				</div>
				<div class="rounded-md bg-green-50 p-3 text-center">
					<p class="text-xs text-green-600">Savings</p>
					<p class="font-medium text-green-700">{getSavingsPercentage()}%</p>
				</div>
			</div>
		</div>
	{/if}
</div>
