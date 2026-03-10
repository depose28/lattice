import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.15em', fontFamily: 'monospace' }}>LATTICE</span>,
  project: {
    link: 'https://github.com/your-org/lattice',
  },
  docsRepositoryBase: 'https://github.com/your-org/lattice/tree/main/docs-site',
  darkMode: true,
  nextThemes: {
    defaultTheme: 'dark',
  },
  footer: {
    text: 'Lattice Documentation',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Lattice Docs" />
      <meta property="og:description" content="Documentation for Lattice — a neural graph of 700 mental models" />
    </>
  ),
  useNextSeoProps() {
    return {
      titleTemplate: '%s — Lattice Docs'
    }
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    float: true,
  },
  primaryHue: 45,
  primarySaturation: 70,
}

export default config
