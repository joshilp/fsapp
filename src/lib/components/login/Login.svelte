<script lang="ts">
	import { signIn, signUp } from './login.remote';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex flex-1 items-center justify-center px-4 py-12">
	<Tabs.Root value="signin" class="w-full max-w-sm">
		<Tabs.List class="grid w-full grid-cols-2">
			<Tabs.Trigger value="signin">Sign In</Tabs.Trigger>
			<Tabs.Trigger value="signup">Sign Up</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="signin">
			<Card.Root>
				<Card.Header>
					<Card.Title>Welcome back</Card.Title>
					<Card.Description>Sign in to your account to continue.</Card.Description>
				</Card.Header>
				<Card.Content>
					<form {...signIn} class="grid gap-4" oninput={() => signIn.validate()}>
						<div class="grid gap-2">
							<Label for="signin-email">Email</Label>
							{#each signIn.fields.email.issues() as issue}
								<p class="text-destructive text-xs">{issue.message}</p>
							{/each}
							<Input
								{...signIn.fields.email.as('email')}
								id="signin-email"
								placeholder="you@example.com"
							/>
						</div>

						<div class="grid gap-2">
							<Label for="signin-password">Password</Label>
							{#each signIn.fields._password.issues() as issue}
								<p class="text-destructive text-xs">{issue.message}</p>
							{/each}
							<Input
								{...signIn.fields._password.as('password')}
								id="signin-password"
								placeholder="••••••••"
							/>
						</div>

						{#if signIn.result?.error}
							<p class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
								{signIn.result.error}
							</p>
						{/if}

						<Button type="submit" class="w-full">Sign In</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<Tabs.Content value="signup">
			<Card.Root>
				<Card.Header>
					<Card.Title>Create an account</Card.Title>
					<Card.Description>Enter your details to get started.</Card.Description>
				</Card.Header>
				<Card.Content>
					<form {...signUp} class="grid gap-4" oninput={() => signUp.validate()}>
						<div class="grid gap-2">
							<Label for="signup-name">Name</Label>
							{#each signUp.fields.name.issues() as issue}
								<p class="text-destructive text-xs">{issue.message}</p>
							{/each}
							<Input
								{...signUp.fields.name.as('text')}
								id="signup-name"
								placeholder="Jane Doe"
							/>
						</div>

						<div class="grid gap-2">
							<Label for="signup-email">Email</Label>
							{#each signUp.fields.email.issues() as issue}
								<p class="text-destructive text-xs">{issue.message}</p>
							{/each}
							<Input
								{...signUp.fields.email.as('email')}
								id="signup-email"
								placeholder="you@example.com"
							/>
						</div>

						<div class="grid gap-2">
							<Label for="signup-password">Password</Label>
							{#each signUp.fields._password.issues() as issue}
								<p class="text-destructive text-xs">{issue.message}</p>
							{/each}
							<Input
								{...signUp.fields._password.as('password')}
								id="signup-password"
								placeholder="••••••••"
							/>
						</div>

						{#if signUp.result?.error}
							<p class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
								{signUp.result.error}
							</p>
						{/if}

						<Button type="submit" class="w-full">Create Account</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>
