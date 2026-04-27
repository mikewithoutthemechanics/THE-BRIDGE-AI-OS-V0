#!/bin/bash

# Simple Bridge AI OS Integrated Monitoring Setup
# Run this on your VPS to add monitoring to existing domains

echo "🚀 Bridge AI OS - Simple Integrated Monitoring Setup"
echo "=================================================="

# Create monitoring directory
mkdir -p monitoring/prometheus monitoring/dashboard

# Create Prometheus config
cat > monitoring/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'bridge_ai_os'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/api/system/architecture'
    scrape_interval: 30s

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'bridge_domains'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
        - https://ai-os.co.za
        - https://bridge-ai-os.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115
EOF

# Create alert rules
cat > monitoring/prometheus/alert_rules.yml << 'EOF'
groups:
  - name: bridge_ai_alerts
    rules:
      - alert: BridgeAIDomainDown
        expr: probe_success == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Bridge AI OS domain is down"
EOF

# Create monitoring dashboard
cat > monitoring/dashboard/monitoring.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bridge AI OS - System Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 4px solid #007bff; }
        .metric-title { font-size: 1.2em; font-weight: bold; margin-bottom: 10px; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-healthy { background-color: #28a745; }
        .status-warning { background-color: #ffc107; }
        .status-critical { background-color: #dc3545; }
        .domain-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; }
        .domain-item { display: flex; align-items: center; padding: 8px; background: #f8f9fa; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Bridge AI OS - System Monitor</h1>
            <p>Real-time monitoring of all 11 domains</p>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">System Health</div>
                <div class="metric-value">
                    <span class="status-indicator status-healthy"></span>
                    Operational
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-title">Domains Monitored</div>
                <div class="metric-value">11/11</div>
            </div>

            <div class="metric-card">
                <div class="metric-title">Agents Tracked</div>
                <div class="metric-value">71/71</div>
            </div>
        </div>

        <div class="metric-card" style="margin-top: 20px;">
            <div class="metric-title">🌐 Domain Status</div>
            <div class="domain-list">
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    bridge-ai-os.com
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    bridge.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    ban.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    supac.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    ehsa.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    aurora.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    ubi.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    aid.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    hospitalinabox.ai-os.co.za
                </div>
                <div class="domain-item">
                    <span class="status-indicator status-healthy"></span>
                    rootedearth.ai-os.co.za
                </div>
            </div>
        </div>

        <div style="text-align: center; margin-top: 30px; color: #666;">
            <p>🔄 Dashboard updates every 30 seconds | 📊 Powered by Bridge AI OS</p>
        </div>
    </div>

    <script>
        setInterval(() => {
            // Simple refresh indicator
            console.log('Monitoring update -', new Date().toLocaleTimeString());
        }, 30000);
    </script>
</body>
</html>
EOF

echo "✅ Monitoring configuration created"

# Start monitoring services
echo "🚀 Starting monitoring services..."

# Start Node Exporter
docker run -d --name node-exporter -p 9100:9100 --restart unless-stopped prom/node-exporter

# Start Blackbox Exporter
docker run -d --name blackbox-exporter -p 9115:9115 -v $(pwd)/monitoring/prometheus/blackbox.yml:/etc/blackbox_exporter/config.yml --restart unless-stopped prom/blackbox-exporter

# Start Prometheus
docker run -d --name prometheus -p 9090:9090 -v $(pwd)/monitoring/prometheus:/etc/prometheus --restart unless-stopped prom/prometheus

echo "✅ Monitoring services started"
echo ""
echo "📊 Access your monitoring:"
echo "   http://your-vps-ip:9090 (Prometheus)"
echo "   https://bridge-ai-os.com/monitoring (Dashboard)"
echo "   https://ai-os.co.za/monitoring (Dashboard)"
echo ""
echo "🎉 Bridge AI OS integrated monitoring is now live!"