/**
 * Neon Data Layer - MooseStack Application
 *
 * This is the main entry point for the MooseStack data layer.
 * It exports all data models, APIs, and flows.
 *
 * Architecture:
 * - Data models define ClickHouse tables and TypeScript types
 * - APIs provide type-safe query endpoints
 * - Flows handle streaming transformations (OTel → internal format)
 *
 * Usage:
 * - Development: `moose dev` (hot-reload)
 * - Production: `moose build && moose start`
 */

// Data models (ClickHouse tables)
export * from "./datamodels";

// Query APIs
export * from "./apis";

// Streaming flows
export * from "./flows";
