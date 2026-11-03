import { defineConfig } from 'wxt';

// Extension id: pengpbbmpcbooclpejbchalnjamfgbmm (derived from `key`; regenerate with scripts/gen-key.sh).
// backend/.env EXTENSION_ORIGIN must be chrome-extension://pengpbbmpcbooclpejbchalnjamfgbmm
export default defineConfig({
  // Not a dot-folder, so the macOS "Load unpacked" picker shows it.
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Breadcrumbs: History Assistant',
    description: 'Ask questions about your own browsing history. Everything stays on your machine.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoivrcXZrBZo6hj1LRo6YxvSc5HR7zyTnhTakLZkjrArbxLPhkpxj3MyYexrbT3BApk0dhbGWWixB71VLs8+d4JE3OShAhxCaVcbqWqTL/2y/e8wM010dOrspwb1pA+/4bjBxWAdM9KsSCPgEefUYRAEn1zBB21wA99jZrBGhCt85el3hdmre1qDD0UsV1EisbKBZ22RPjGvKOZuqncqEkTPYeSfBimE0clhOR+AB7INXEEIdml5H9cGBXIpZUz4RfICwQFHKPCBXC8w1Iuoh3zuDd1IkLowvQPbrXQi+fzB5WzGOpSKXYS7P24uGc5F9uQuNfclp5dqAe/LhMJ9mFQIDAQAB',
    permissions: ['history', 'sidePanel', 'storage'],
    host_permissions: ['http://localhost:8000/*', '<all_urls>'],
    action: {},
  },
});
