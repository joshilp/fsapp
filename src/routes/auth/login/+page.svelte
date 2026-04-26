<script lang="ts">
	import Login from '$lib/components/login/Login.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Login allowSignup={data.allowSignup} />
