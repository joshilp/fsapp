<script lang="ts">
	import Logout from '$lib/components/logout/Logout.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-1 items-center justify-center px-4 py-12">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>Hello, {data.user.name}!</Card.Title>
			<Card.Description>{data.user.email}</Card.Description>
		</Card.Header>
		<Card.Content>
			<p class="text-muted-foreground text-sm">You're successfully signed in.</p>
		</Card.Content>
		<Card.Footer>
			<Logout />
		</Card.Footer>
	</Card.Root>
</div>
