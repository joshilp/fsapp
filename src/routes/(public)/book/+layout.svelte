<script lang="ts">
	import '../../layout.css';

	let { children }: { children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{@render children()}
