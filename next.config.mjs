/** @type {import('next').NextConfig} */
const nextConfig = {
  // Oculta o header X-Powered-By: Next.js nas respostas
  poweredByHeader: false,

  // build.js copia .next/standalone para dist/ (preview local via abrir-dist)
  output: 'standalone',

  // Garante que variáveis de ambiente server-side não vazem pro client bundle
  serverExternalPackages: ['@supabase/supabase-js'],
}

export default nextConfig
