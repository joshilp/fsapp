<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex flex-1 flex-col items-center justify-center gap-4">
	<h1 class="text-4xl font-bold tracking-tight">Welcome</h1>
	<p class="text-muted-foreground">Get started by signing in to your account.</p>
	<div class="flex gap-3">
		<Button href="/auth">Dashboard</Button>
		<Button href="/auth/login" variant="outline">Sign In</Button>
	</div>
</div>
