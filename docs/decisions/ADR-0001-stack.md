# ADR-0001: Stack

Status: accepted, 2026-08-09.

Choose a pnpm strict-TypeScript monorepo, React/Vite Mini App and one Hono Cloudflare Worker. This
minimises free-plan requests, deploy units and operational drift while keeping domain/provider
packages independent. Alternatives Node containers and multiple Workers add recurring dependency
or request hops and are rejected for the initial Free deployment.
