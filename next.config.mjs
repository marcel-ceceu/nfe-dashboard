/** @type {import('next').NextConfig} */
const nextConfig = {
  // Oculta o header X-Powered-By: Next.js nas respostas
  poweredByHeader: false,

  // Garante que variáveis de ambiente server-side não vazem pro client bundle
  serverExternalPackages: ['@supabase/supabase-js'],
}

export default nextConfig
