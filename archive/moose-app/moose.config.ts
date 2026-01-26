import { MooseConfig } from "@514labs/moose-lib";

const config: MooseConfig = {
  project: {
    name: "neon-data",
    language: "TypeScript",
  },
  // Infrastructure configuration
  infrastructure: {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || "localhost",
      port: parseInt(process.env.CLICKHOUSE_PORT || "8123"),
      database: "neon",
      user: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
    },
    redpanda: {
      brokers: (process.env.REDPANDA_BROKERS || "localhost:9092").split(","),
    },
  },
  // API server configuration
  http: {
    port: parseInt(process.env.MOOSE_PORT || "4000"),
  },
};

export default config;
