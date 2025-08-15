<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-dvh bg-[#EDEDED] font-serif text-gray-800 antialiased">
	<div class="container mx-auto px-4 py-6 lg:max-w-screen-md">
		{@render children()}
	</div>
</div>
