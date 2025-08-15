<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import JSZip from 'jszip';
	import ImageComparison from '$lib/ImageComparison.svelte';
	import { convertImageToWebP } from '$lib/imageConverter.js';

	// Types for each uploaded item
	type UploadStatus = 'queued' | 'converting' | 'done' | 'error';
	type UploadItem = {
		id: string;
		file: File;
		status: UploadStatus;
		errorMessage?: string;
		outputUrl?: string;
		outputBlob?: Blob;
		outputName?: string;
		sizeBefore: number;
		sizeAfter?: number;
		thumbnailUrl?: string; // Cache thumbnail URL
	};

	const items = $state<UploadItem[]>([]);
	let quality = $state(0.8); // 0..1
	const hasQueued = $derived(items.some((i) => i.status === 'queued' || i.status === 'error'));
	const hasDone = $derived(items.some((i) => i.status === 'done' && i.outputBlob));
	let selectedPreviewItem = $state<UploadItem | null>(null);
	let previewUpdateTimeout: number | null = null;

	function updatePreviewItemDebounced(item: UploadItem | null) {
		if (previewUpdateTimeout) {
			clearTimeout(previewUpdateTimeout);
		}
		previewUpdateTimeout = setTimeout(() => {
			selectedPreviewItem = item;
			previewUpdateTimeout = null;
		}, 150);
	}

	function onFileInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (!target.files) return;
		handleFiles(target.files);
		target.value = '';
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;
		const files = event.dataTransfer.files;
		handleFiles(files);
	}

	function handleFiles(fileList: FileList) {
		const acceptedTypes = new Set(['image/jpeg', 'image/png']);
		const newItems: UploadItem[] = [];
		for (const file of Array.from(fileList)) {
			if (!acceptedTypes.has(file.type)) {
				newItems.push({
					id: crypto.randomUUID(),
					file,
					status: 'error',
					errorMessage: 'Unsupported file type. Please upload JPEG or PNG.',
					sizeBefore: file.size
				});
				continue;
			}
			// Pre-create thumbnail URL to avoid flickering
			const thumbnailUrl = URL.createObjectURL(file);
			newItems.push({
				id: crypto.randomUUID(),
				file,
				status: 'queued',
				sizeBefore: file.size,
				thumbnailUrl
			});
		}
		items.push(...newItems);
		// Only auto-select if no preview is currently selected
		// Use a small delay to avoid flicker when adding multiple files
		if (!selectedPreviewItem && newItems.length > 0) {
			setTimeout(() => {
				if (!selectedPreviewItem) {
					const firstValid = newItems.find((item) => item.status !== 'error');
					if (firstValid) selectedPreviewItem = firstValid;
				}
			}, 100);
		}
	}

	async function convertAll() {
		for (const item of items) {
			if (item.status !== 'queued' && item.status !== 'error') continue;
			item.status = 'converting';
			try {
				const blob = await convertImageToWebP(item.file, quality);
				const outputName = item.file.name.replace(/\.(jpe?g|png)$/i, '') + '.webp';
				const url = URL.createObjectURL(blob);
				item.outputBlob = blob;
				item.outputUrl = url;
				item.outputName = outputName;
				item.sizeAfter = blob.size;
				item.status = 'done';
			} catch (err) {
				item.status = 'error';
				item.errorMessage = err instanceof Error ? err.message : 'Failed to convert to WebP.';
			}
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}

	function downloadBlob(blob: Blob, filename: string) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = filename;
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function clearAll() {
		for (const item of items) {
			if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
			if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
		}
		items.length = 0;
		selectedPreviewItem = null; // Clear the preview
	}

	function deleteItem(id: string) {
		const index = items.findIndex((i) => i.id === id);
		if (index !== -1) {
			const item = items[index];
			if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
			if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
			// Update preview selection if deleted item was selected
			if (selectedPreviewItem?.id === id) {
				const remainingItems = items.filter((_, i) => i !== index);
				selectedPreviewItem = remainingItems.find((item) => item.status !== 'error') || null;
			}
			items.splice(index, 1);
		}
	}

	async function downloadAllZip() {
		const zip = new JSZip();
		let added = 0;
		for (const item of items) {
			if (item.status === 'done' && item.outputBlob) {
				zip.file(
					item.outputName ?? item.file.name.replace(/\.(jpe?g|png)$/i, '') + '.webp',
					item.outputBlob
				);
				added++;
			}
		}
		if (added === 0) return;
		const blob = await zip.generateAsync({ type: 'blob' });
		downloadBlob(blob, 'converted-webp.zip');
	}
</script>

<div
	class=" sticky top-0 z-20 flex flex-1 items-center rounded-lg rounded-l-2xl border border-gray-200 bg-transparent/60 shadow-lg
				shadow-gray-300 backdrop-blur transition-all duration-300 hover:scale-105 hover:bg-gray-100 supports-[backdrop-filter]:bg-transparent/60"
>
	<img
		src="/app_icon.png"
		alt="Tomlord"
		class="mr-2 h-12 w-12 rounded-2xl border-2 border-gray-300 sm:h-15 sm:w-15"
	/>
	<div class="container mx-auto flex items-center">
		<h1 class="page-title p-3 pb-3 font-serif text-2xl text-gray-900 sm:text-3xl">Webpify</h1>
	</div>
</div>

<main class="mt-6 flex min-h-screen flex-col gap-4">
	<section class="rounded-lg border border-gray-300 bg-white shadow-sm">
		<div class="flex flex-col gap-4 p-4 sm:p-6">
			<div class="prose prose-sm font-serif text-gray-700 sm:prose-base">
				<p>
					Upload JPEG or PNG images and convert them to <code>webp</code> format.
				</p>
			</div>

			<div
				ondrop={onDrop}
				ondragover={(e) => e.preventDefault()}
				role="button"
				tabindex="0"
				class="flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center transition-colors hover:bg-gray-100"
				aria-label="Drop images here"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="h-10 w-10 text-gray-500"
				>
					<path
						fill-rule="evenodd"
						d="M3 7.5A4.5 4.5 0 0 1 7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9Zm6.28 5.22 2.47 2.47 3.47-4.34a.75.75 0 0 1 1.17.93l-4 5a.75.75 0 0 1-1.12.06l-3-3a.75.75 0 1 1 1.06-1.06Z"
						clip-rule="evenodd"
					/>
				</svg>
				<p class="text-sm text-gray-600">Drag and drop images here</p>
				<div class="flex items-center gap-2">
					<label
						class="inline-flex cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
					>
						<input
							type="file"
							accept="image/jpeg,image/png"
							multiple
							class="sr-only"
							onchange={onFileInputChange}
							aria-label="Choose images"
						/>
						<span>Choose images</span>
					</label>
					<button
						type="button"
						class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
						onclick={clearAll}
						aria-label="Clear list"
					>
						Clear list
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<label for="quality-slider" class="text-sm text-gray-700">Quality</label>
				<input
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					bind:value={quality}
					class="w-full sm:max-w-xs"
					aria-label="Quality slider"
				/>
				<span class="text-xs text-gray-600">{Math.round(quality * 100)}%</span>
			</div>
			<div class="flex flex-wrap items-center gap-2 pt-2">
				<button
					type="button"
					onclick={convertAll}
					class="rounded-md bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!hasQueued}
					aria-label="Convert all images"
				>
					Convert all
				</button>
				<button
					type="button"
					onclick={downloadAllZip}
					class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!hasDone}
					aria-label="Download all converted images as zip"
				>
					Download all (zip)
				</button>
			</div>
		</div>
	</section>

	{#if selectedPreviewItem}
		<div class="min-h-96 flex-1" in:fade={{ duration: 200 }} out:fade={{ duration: 100 }}>
			<ImageComparison
				originalFile={selectedPreviewItem.file}
				{quality}
				onWebPGenerated={(blob, size) => {
					if (selectedPreviewItem) {
						selectedPreviewItem.sizeAfter = size;
						if (selectedPreviewItem.outputBlob && selectedPreviewItem.outputUrl) {
							URL.revokeObjectURL(selectedPreviewItem.outputUrl);
						}
						selectedPreviewItem.outputBlob = blob;
						selectedPreviewItem.outputUrl = URL.createObjectURL(blob);
						selectedPreviewItem.outputName =
							selectedPreviewItem.file.name.replace(/\.(jpe?g|png)$/i, '') + '.webp';
					}
				}}
			/>
		</div>
	{/if}

	{#if items.length > 0}
		<section class="rounded-lg border border-gray-300 bg-white shadow-sm">
			<div class="p-4 sm:p-6">
				<ul class="divide-y divide-gray-100">
					{#each items as item (item.id)}
						<li class="flex items-start gap-3 py-3" transition:slide={{ duration: 300 }}>
							<button
								type="button"
								onclick={() => updatePreviewItemDebounced(item.status !== 'error' ? item : null)}
								class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-all hover:scale-105 {selectedPreviewItem?.id ===
								item.id
									? 'border-blue-500 ring-2 ring-blue-200'
									: 'border-gray-200'} bg-gray-100"
								aria-label={`Preview ${item.file.name}`}
							>
								{#if item.status !== 'error' && item.thumbnailUrl}
									<img
										alt={item.file.name}
										src={item.thumbnailUrl}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<span class="text-xs text-gray-500">n/a</span>
								{/if}
							</button>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-gray-900">{item.file.name}</p>
								<p class="text-xs text-gray-600">
									{formatBytes(item.sizeBefore)}{#if item.sizeAfter}
										→ {formatBytes(item.sizeAfter)}{/if}
								</p>
								{#if item.status === 'converting'}
									<div
										class="mt-2 h-1 animate-pulse rounded bg-gradient-to-r from-gray-300 to-gray-400"
										aria-label="Converting"
									></div>
								{/if}
								{#if item.status === 'error'}
									<p class="mt-1 text-xs text-red-700">{item.errorMessage}</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if item.status === 'done' && item.outputBlob && item.outputName}
									<a
										href={item.outputUrl}
										download={item.outputName}
										class="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
										aria-label={`Download ${item.outputName}`}
									>
										Download
									</a>
								{/if}
								<button
									type="button"
									onclick={() => deleteItem(item.id)}
									class="rounded-md bg-red-600 px-2.5 py-1.5 text-xs text-white shadow-sm transition-colors hover:bg-red-700"
									aria-label={`Delete ${item.file.name}`}
								>
									Delete
								</button>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}
</main>
