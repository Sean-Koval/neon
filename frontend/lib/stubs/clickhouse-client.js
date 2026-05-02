// Stub module for @clickhouse/client in browser bundles.
// The real ClickHouse client is server-only; this prevents bundle errors
// when Turbopack follows tRPC type inference into server modules.
module.exports = {}
