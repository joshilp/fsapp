<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(ts: Date | null) {
		if (!ts) return '—';
		return new Date(ts).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>User Management</title>
</svelte:head>

<div class="container max-w-3xl py-8">
	<h1 class="text-2xl font-bold mb-1">User Management</h1>
	<p class="text-muted-foreground text-sm mb-6">Approve new accounts and manage admin access.</p>

	<div class="border border-border rounded-lg overflow-hidden">
		<table class="w-full text-sm">
			<thead class="bg-muted/40">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
					<th class="px-4 py-3 text-center font-medium text-muted-foreground">Approved</th>
					<th class="px-4 py-3 text-center font-medium text-muted-foreground">Admin</th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr class="border-t border-border hover:bg-muted/10">
						<td class="px-4 py-3 font-medium">
							{u.name}
							{#if u.id === data.currentUserId}
								<span class="ml-1 text-xs text-muted-foreground">(you)</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-muted-foreground">{u.email}</td>
						<td class="px-4 py-3 text-muted-foreground text-xs">{formatDate(u.createdAt)}</td>

						<!-- Approved toggle -->
						<td class="px-4 py-3 text-center">
							<form method="POST" action="?/toggleApproved" use:enhance>
								<input type="hidden" name="userId" value={u.id} />
								<button
									type="submit"
									class={[
										'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
										u.isApproved
											? 'bg-green-100 text-green-700 hover:bg-green-200'
											: 'bg-red-100 text-red-700 hover:bg-red-200'
									].join(' ')}
								>
									{u.isApproved ? '✓ Approved' : '✗ Pending'}
								</button>
							</form>
						</td>

						<!-- Admin toggle -->
						<td class="px-4 py-3 text-center">
							{#if u.id === data.currentUserId}
								<span class="text-xs text-muted-foreground">
									{u.isAdmin ? 'Admin' : '—'}
								</span>
							{:else}
								<form method="POST" action="?/toggleAdmin" use:enhance>
									<input type="hidden" name="userId" value={u.id} />
									<button
										type="submit"
										class={[
											'rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
											u.isAdmin
												? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
												: 'bg-muted text-muted-foreground hover:bg-muted/70'
										].join(' ')}
									>
										{u.isAdmin ? '★ Admin' : '○ User'}
									</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="mt-6 rounded-md bg-muted/30 border border-border p-4 text-sm text-muted-foreground space-y-1">
		<p><strong>Tip:</strong> To make yourself an admin initially, run this in your terminal:</p>
		<code class="text-xs bg-muted rounded px-2 py-1 block">
			sqlite3 local.db "UPDATE user SET is_admin=1 WHERE email='your@email.com';"
		</code>
	</div>
</div>
