import {defineConfig} from 'vite';
import vinext from 'vinext';
// Dedicated Node/PostgreSQL target. The existing Cloudflare/Sites target is unchanged.
export default defineConfig({plugins:[vinext()],ssr:{external:['pg']},server:{host:'127.0.0.1',port:4177,strictPort:true}});
