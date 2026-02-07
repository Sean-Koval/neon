# Monitoring Module - Dashboard
# terraform/modules/monitoring/dashboard.tf

resource "google_monitoring_dashboard" "main" {
  count          = var.enabled ? 1 : 0
  project        = var.project_id
  dashboard_json = jsonencode({
    displayName = "Neon Platform - ${title(var.environment)}"
    mosaicLayout = {
      columns = 12
      tiles = concat(
        # =====================================================================
        # Row 1: Request Rate & Error Rate
        # =====================================================================
        [
          {
            xPos   = 0
            yPos   = 0
            width  = 6
            height = 4
            widget = {
              title = "Request Rate (by service)"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "requests/s" }
              }
            }
          },
          {
            xPos   = 6
            yPos   = 0
            width  = 6
            height = 4
            widget = {
              title = "Error Rate (5xx responses)"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "errors/s" }
              }
            }
          },
        ],
        # =====================================================================
        # Row 2: Latency & Active Instances
        # =====================================================================
        [
          {
            xPos   = 0
            yPos   = 4
            width  = 6
            height = 4
            widget = {
              title = "Request Latency P50 / P95 / P99"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_PERCENTILE_50"
                          crossSeriesReducer = "REDUCE_MEAN"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType   = "LINE"
                    legendTemplate = "$${resource.labels.service_name} p50"
                  },
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_PERCENTILE_95"
                          crossSeriesReducer = "REDUCE_MEAN"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType   = "LINE"
                    legendTemplate = "$${resource.labels.service_name} p95"
                  },
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_PERCENTILE_99"
                          crossSeriesReducer = "REDUCE_MEAN"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType   = "LINE"
                    legendTemplate = "$${resource.labels.service_name} p99"
                  }
                ]
                yAxis = { label = "ms" }
              }
            }
          },
          {
            xPos   = 6
            yPos   = 4
            width  = 6
            height = 4
            widget = {
              title = "Active Instances"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/instance_count\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_MAX"
                          crossSeriesReducer = "REDUCE_SUM"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType = "STACKED_AREA"
                  }
                ]
                yAxis = { label = "instances" }
              }
            }
          },
        ],
        # =====================================================================
        # Row 3: CPU & Memory Utilization
        # =====================================================================
        [
          {
            xPos   = 0
            yPos   = 8
            width  = 6
            height = 4
            widget = {
              title = "CPU Utilization"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/cpu/utilizations\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_PERCENTILE_95"
                          crossSeriesReducer = "REDUCE_MEAN"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "utilization" }
                thresholds = [
                  {
                    value     = local.thresholds.cpu_utilization_percent / 100
                    color     = "RED"
                    direction = "ABOVE"
                    label     = "Alert threshold"
                  }
                ]
              }
            }
          },
          {
            xPos   = 6
            yPos   = 8
            width  = 6
            height = 4
            widget = {
              title = "Memory Utilization"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/container/memory/utilizations\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_PERCENTILE_95"
                          crossSeriesReducer = "REDUCE_MEAN"
                          groupByFields    = ["resource.labels.service_name"]
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "utilization" }
                thresholds = [
                  {
                    value     = local.thresholds.memory_utilization_percent / 100
                    color     = "RED"
                    direction = "ABOVE"
                    label     = "Alert threshold"
                  }
                ]
              }
            }
          },
        ],
        # =====================================================================
        # Row 4: Temporal Metrics
        # =====================================================================
        [
          {
            xPos   = 0
            yPos   = 12
            width  = 4
            height = 4
            widget = {
              title = "Temporal Workflow Failures"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-workflow-failures\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "failures/s" }
              }
            }
          },
          {
            xPos   = 4
            yPos   = 12
            width  = 4
            height = 4
            widget = {
              title = "Temporal Activity Timeouts"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-activity-timeouts\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "timeouts/s" }
              }
            }
          },
          {
            xPos   = 8
            yPos   = 12
            width  = 4
            height = 4
            widget = {
              title = "Temporal Task Queue Backlog"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/temporal-task-queue-backlog\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_MAX"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "pending tasks" }
                thresholds = [
                  {
                    value     = local.thresholds.task_queue_backlog_threshold
                    color     = "YELLOW"
                    direction = "ABOVE"
                    label     = "Alert threshold"
                  }
                ]
              }
            }
          },
        ],
        # =====================================================================
        # Row 5: Application Health
        # =====================================================================
        [
          {
            xPos   = 0
            yPos   = 16
            width  = 4
            height = 4
            widget = {
              title = "Trace Ingestion Failures"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/trace-ingestion-failures\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "failures/s" }
              }
            }
          },
          {
            xPos   = 4
            yPos   = 16
            width  = 4
            height = 4
            widget = {
              title = "Authentication Failures"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/auth-failures\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_SUM"
                          crossSeriesReducer = "REDUCE_SUM"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "failures" }
              }
            }
          },
          {
            xPos   = 8
            yPos   = 16
            width  = 4
            height = 4
            widget = {
              title = "API Errors"
              xyChart = {
                dataSets = [
                  {
                    timeSeriesQuery = {
                      timeSeriesFilter = {
                        filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/neon-${var.environment}/api-errors\""
                        aggregation = {
                          alignmentPeriod  = "60s"
                          perSeriesAligner = "ALIGN_RATE"
                          crossSeriesReducer = "REDUCE_SUM"
                        }
                      }
                    }
                    plotType = "LINE"
                  }
                ]
                yAxis = { label = "errors/s" }
              }
            }
          },
        ],
      )
    }
  })
}
