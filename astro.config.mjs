import { defineConfig } from 'astro/config';
import { blessingCards } from './integrations/blessing-cards.mjs';

export default defineConfig({
  site: 'https://wishmeteor.net',
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto' },
  integrations: [blessingCards()],
});
