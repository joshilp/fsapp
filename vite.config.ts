import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Listen on all interfaces so both IPv4 (127.0.0.1) and IPv6 (::1)
		// resolve correctly. Required for Playwright API tests on Windows where
		// Node.js resolves 'localhost' to ::1 but Vite defaults to 127.0.0.1.
		host: '0.0.0.0',
		port: 5174,
		strictPort: true,
	}
});
