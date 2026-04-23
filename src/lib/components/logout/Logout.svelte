<script lang="ts">
	import { logout } from '$lib/components/login/login.remote';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button/index.js';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
	};

	let { variant = 'outline', size = 'default', class: className }: Props = $props();
</script>

<form {...logout}>
	<Button type="submit" {variant} {size} class={className}>Sign Out</Button>
</form>
