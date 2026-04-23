<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
    import type { Snippet } from 'svelte';

    type TriggerVariant = NonNullable<Parameters<typeof buttonVariants>[0]>['variant'];
    type TriggerSize = NonNullable<Parameters<typeof buttonVariants>[0]>['size'];

    type Props = {
        title?: string;
        open?: boolean;
        description?: string;
        trigger?: Snippet;
        /** Rendered top-right in the dialog header, alongside the title. Useful for secondary actions like "Reorder". */
        actions?: Snippet;
        hero?: Snippet;
        content?: Snippet;
        footer?: Snippet;
        /** Variant for the trigger button. Defaults to 'default'. */
        triggerVariant?: TriggerVariant;
        /** Size for the trigger button. Defaults to 'default'. */
        triggerSize?: TriggerSize;
        class?: string;
        style?: string;
        /** Inline style applied to the content wrapper — pass siteState.style here so
         *  colour presets inside the dialog resolve to the site's theme variables
         *  rather than the app's theme. Does not affect the dialog chrome itself. */
        siteStyle?: string;
        disabled?: boolean;
        /** Extra classes merged onto Dialog.Content — use to override the default width (sm:max-w-2xl) or other content-level styles. */
        dialogClass?: string;
    };
    let {
        title,
        open = $bindable(false),
        description,
        trigger,
        actions,
        hero,
        content,
        footer,
        triggerVariant = 'default',
        triggerSize = 'default',
        class: className = '',
        style,
        siteStyle,
        disabled = false,
        dialogClass = '',
    }: Props = $props();
   
</script>

<Dialog.Root bind:open>
    {#if trigger}
        <Dialog.Trigger type="button" class={cn(buttonVariants({ variant: triggerVariant, size: triggerSize }), className)} style={style} disabled={disabled}>
            {@render trigger?.()}
        </Dialog.Trigger>
    {/if}
    <Dialog.Content class={cn("data-nested-open:hidden max-h-[80vh] grid grid-rows-[auto_1fr_auto] sm:max-w-2xl z-53", dialogClass)}>
        <Dialog.Header>
            <div class="flex items-center justify-between gap-2 pr-10">
                <Dialog.Title>{title}</Dialog.Title>
                {#if actions}
                    <div class="flex items-center gap-1 shrink-0">
                        {@render actions?.()}
                    </div>
                {/if}
            </div>
            {#if description}
                <Dialog.Description>
                    {description}
                </Dialog.Description>
            {/if}
            {@render hero?.()}
        </Dialog.Header>
        <div class="overflow-y-auto h-full" style={siteStyle}>
            {@render content?.()}
        </div>
        <Dialog.Footer>
            {@render footer?.()}
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
