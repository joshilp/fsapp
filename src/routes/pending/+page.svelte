<svelte:head>
	<title>Account Pending</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
	<div class="max-w-sm w-full text-center space-y-4">
		<div class="text-5xl">⏳</div>
		<h1 class="text-xl font-semibold">Account Pending Approval</h1>
		<p class="text-muted-foreground text-sm">
			Your account has been created but is awaiting approval from an administrator.
			Please contact the office to get your account activated.
		</p>
		<a href="/auth/login" class="text-sm text-primary underline underline-offset-2">
			← Back to sign in
		</a>
	</div>
</div>
