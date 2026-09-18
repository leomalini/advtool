import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Raiz fixa no projeto. Sem isto o Next procura o lockfile subindo as
    // pastas, e numa máquina com um package-lock.json na pasta do usuário a
    // raiz vira a pasta do usuário: pacotes instalados lá passam a resolver na
    // build local e faltam na Vercel. Foi assim que um `require("lodash")` não
    // declarado passou aqui e quebrou o deploy.
    root: __dirname,
  },
};

export default nextConfig;
