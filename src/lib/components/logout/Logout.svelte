<script lang="ts">
	import { logout } from '$lib/components/login/login.remote';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button/index.js';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
	};

	let { variant = 'outline', size = 'default', class: className }: Props = $props();

	// Each mounted instance needs its own form object — otherwise the same remote
	// form tries to attach to multiple <form> elements and throws.
	const instance = logout.for(Symbol());
</script>

<form {...instance}>
	<Button type="submit" {variant} {size} class={className}>Sign Out</Button>
</form>
